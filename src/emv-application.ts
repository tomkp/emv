import type { CardResponse, SmartCard, Reader } from './types.js';
import { findTagInBuffer } from './emv-tags.js';

/**
 * AFL (Application File Locator) entry
 */
export interface AflEntry {
    sfi: number;
    firstRecord: number;
    lastRecord: number;
    sdaRecords: number;
}

/**
 * PDOL/CDOL entry (tag + length)
 */
export interface DolEntry {
    tag: number;
    length: number;
}

/**
 * Transaction options
 */
export interface TransactionOptions {
    /** Amount in minor units (e.g., cents) */
    amount: number;
    /** ISO 4217 currency code (e.g., 0x0840 for USD) */
    currencyCode: number;
    /** Transaction type (0x00 = purchase, 0x01 = cash, 0x09 = cashback) */
    transactionType?: number;
    /** Cryptogram type to request: 'ARQC' (online), 'TC' (offline approve), 'AAC' (decline) */
    cryptogramType?: 'ARQC' | 'TC' | 'AAC';
    /** Additional tag values for PDOL */
    pdolValues?: Map<number, Buffer>;
    /** Additional tag values for CDOL */
    cdolValues?: Map<number, Buffer>;
}

/**
 * Transaction result
 */
export interface TransactionResult {
    success: boolean;
    error?: string | undefined;
    /** AIP from GPO response */
    aip?: Buffer | undefined;
    /** AFL entries from GPO response */
    afl?: AflEntry[] | undefined;
    /** Records read from card */
    records?: Buffer[] | undefined;
    /** Cryptogram type returned by card */
    cryptogramType?: 'ARQC' | 'TC' | 'AAC' | undefined;
    /** Application cryptogram */
    cryptogram?: Buffer | undefined;
    /** Application Transaction Counter */
    atc?: number | undefined;
    /** Full Generate AC response */
    generateAcResponse?: Buffer | undefined;
}

/**
 * Payment System Environment (PSE) identifier
 * "1PAY.SYS.DDF01" encoded as bytes
 */
const PSE = Buffer.from([
    0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e, 0x44, 0x44, 0x46, 0x30, 0x31,
]);

/**
 * Parse APDU response into CardResponse
 */
function parseResponse(response: Buffer): CardResponse {
    const sw1 = response[response.length - 2] ?? 0;
    const sw2 = response[response.length - 1] ?? 0;
    const data = response.subarray(0, response.length - 2);

    return {
        buffer: data,
        sw1,
        sw2,
        isOk: () => sw1 === 0x90 && sw2 === 0x00,
    };
}

/**
 * Build SELECT FILE APDU command
 */
function buildSelectApdu(data: Buffer): Buffer {
    return Buffer.from([
        0x00, // CLA
        0xa4, // INS: SELECT
        0x04, // P1: Select by DF name
        0x00, // P2: First or only occurrence
        data.length, // Lc
        ...data,
        0x00, // Le: Maximum response length
    ]);
}

/**
 * Build READ RECORD APDU command
 */
function buildReadRecordApdu(sfi: number, record: number): Buffer {
    const p2 = (sfi << 3) | 0x04; // SFI in upper 5 bits, 0x04 = read record
    return Buffer.from([
        0x00, // CLA
        0xb2, // INS: READ RECORD
        record, // P1: Record number
        p2, // P2: SFI and read mode
        0x00, // Le: Maximum response length
    ]);
}

/**
 * Build GET DATA APDU command
 */
function buildGetDataApdu(tag: number): Buffer {
    const p1 = (tag >> 8) & 0xff; // High byte of tag
    const p2 = tag & 0xff; // Low byte of tag
    return Buffer.from([
        0x80, // CLA: proprietary
        0xca, // INS: GET DATA
        p1, // P1: high byte of tag
        p2, // P2: low byte of tag
        0x00, // Le: maximum response length
    ]);
}

/**
 * Build GET PROCESSING OPTIONS APDU command
 */
function buildGpoApdu(pdolData: Buffer): Buffer {
    // Command data is wrapped in tag 83 (Command Template)
    const commandData = Buffer.from([0x83, pdolData.length, ...pdolData]);
    return Buffer.from([
        0x80, // CLA: proprietary
        0xa8, // INS: GET PROCESSING OPTIONS
        0x00, // P1
        0x00, // P2
        commandData.length, // Lc
        ...commandData,
        0x00, // Le: maximum response length
    ]);
}

/**
 * Build GENERATE APPLICATION CRYPTOGRAM APDU command
 */
function buildGenerateAcApdu(cryptogramType: number, cdolData: Buffer): Buffer {
    return Buffer.from([
        0x80, // CLA: proprietary
        0xae, // INS: GENERATE AC
        cryptogramType, // P1: cryptogram type
        0x00, // P2
        cdolData.length, // Lc
        ...cdolData,
        0x00, // Le: maximum response length
    ]);
}

/**
 * Build INTERNAL AUTHENTICATE APDU command
 */
function buildInternalAuthenticateApdu(authData: Buffer): Buffer {
    return Buffer.from([
        0x00, // CLA
        0x88, // INS: INTERNAL AUTHENTICATE
        0x00, // P1
        0x00, // P2
        authData.length, // Lc
        ...authData,
        0x00, // Le: maximum response length
    ]);
}

/**
 * Parse AFL (Application File Locator) from buffer.
 * Each AFL entry is 4 bytes: SFI (5 bits) | 000, first record, last record, SDA records
 */
export function parseAfl(buffer: Buffer): AflEntry[] {
    const entries: AflEntry[] = [];
    for (let i = 0; i + 3 < buffer.length; i += 4) {
        const sfiByte = buffer[i];
        const firstRecord = buffer[i + 1];
        const lastRecord = buffer[i + 2];
        const sdaRecords = buffer[i + 3];
        if (sfiByte === undefined || firstRecord === undefined || lastRecord === undefined || sdaRecords === undefined) {
            continue;
        }
        entries.push({
            sfi: sfiByte >> 3,
            firstRecord,
            lastRecord,
            sdaRecords,
        });
    }
    return entries;
}

/**
 * Parse PDOL or CDOL (Data Object List) from buffer.
 * Format: tag (1-2 bytes) + length (1 byte), repeated
 */
export function parsePdol(buffer: Buffer): DolEntry[] {
    const entries: DolEntry[] = [];
    let i = 0;
    while (i < buffer.length) {
        const firstByte = buffer[i];
        if (firstByte === undefined) break;

        let tag: number;
        // Check if it's a two-byte tag (first byte has bits 1-5 all set)
        if ((firstByte & 0x1f) === 0x1f) {
            const secondByte = buffer[i + 1];
            if (secondByte === undefined) break;
            tag = (firstByte << 8) | secondByte;
            i += 2;
        } else {
            tag = firstByte;
            i += 1;
        }

        const length = buffer[i];
        if (length === undefined) break;
        i += 1;

        entries.push({ tag, length });
    }
    return entries;
}

/**
 * Build PDOL/CDOL data from tag entries and values.
 * Missing values are padded with zeros.
 */
export function buildPdolData(entries: DolEntry[], tagValues: Map<number, Buffer>): Buffer {
    const chunks: Buffer[] = [];
    for (const entry of entries) {
        const value = tagValues.get(entry.tag);
        if (value) {
            if (value.length >= entry.length) {
                chunks.push(value.subarray(0, entry.length));
            } else {
                // Pad with leading zeros if value is shorter
                const padded = Buffer.alloc(entry.length);
                value.copy(padded, entry.length - value.length);
                chunks.push(padded);
            }
        } else {
            // No value provided, use zeros
            chunks.push(Buffer.alloc(entry.length));
        }
    }
    return Buffer.concat(chunks);
}

/**
 * Convert cryptogram type string to byte value
 */
function cryptogramTypeToByte(type: 'ARQC' | 'TC' | 'AAC'): number {
    switch (type) {
        case 'AAC': return 0x00;
        case 'TC': return 0x40;
        case 'ARQC': return 0x80;
    }
}

/**
 * Convert CID byte to cryptogram type string
 */
function byteToCryptogramType(cid: number): 'ARQC' | 'TC' | 'AAC' | undefined {
    const type = cid & 0xc0;
    switch (type) {
        case 0x00: return 'AAC';
        case 0x40: return 'TC';
        case 0x80: return 'ARQC';
        default: return undefined;
    }
}

/**
 * Convert amount to 6-byte BCD format (12 digits)
 */
function amountToBcd(amount: number): Buffer {
    const str = amount.toString().padStart(12, '0');
    const buf = Buffer.alloc(6);
    for (let i = 0; i < 6; i++) {
        const d1 = parseInt(str[i * 2] ?? '0', 10);
        const d2 = parseInt(str[i * 2 + 1] ?? '0', 10);
        buf[i] = (d1 << 4) | d2;
    }
    return buf;
}

/**
 * Get current date as BCD YYMMDD
 */
function getCurrentDateBcd(): Buffer {
    const now = new Date();
    const year = (now.getFullYear() % 100).toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return Buffer.from([
        parseInt(year, 16),
        parseInt(month, 16),
        parseInt(day, 16),
    ]);
}

/**
 * Build PIN block in ISO 9564 Format 2 (BCD with 0xF padding)
 */
function buildPinBlock(pin: string): Buffer {
    const pinLength = pin.length;
    const pinBlock = Buffer.alloc(8);

    // First byte: 0x20 | PIN length
    pinBlock[0] = 0x20 | pinLength;

    // Encode PIN digits as BCD (two digits per byte), pad with 0xF
    for (let i = 0; i < 7; i++) {
        const char1 = pin[i * 2];
        const char2 = pin[i * 2 + 1];
        const digit1 = char1 !== undefined ? parseInt(char1, 10) : 0xf;
        const digit2 = char2 !== undefined ? parseInt(char2, 10) : 0xf;
        pinBlock[i + 1] = (digit1 << 4) | digit2;
    }

    return pinBlock;
}

/**
 * Build VERIFY PIN APDU command
 * PIN is encoded in ISO 9564 Format 2 (BCD with 0xF padding)
 */
function buildVerifyPinApdu(pin: string): Buffer {
    const pinBlock = buildPinBlock(pin);

    return Buffer.from([
        0x00, // CLA
        0x20, // INS: VERIFY
        0x00, // P1
        0x80, // P2: plaintext PIN
        0x08, // Lc: PIN block is always 8 bytes
        ...pinBlock,
    ]);
}

/**
 * Build CHANGE REFERENCE DATA APDU command for PIN change
 * Both old and new PINs are encoded in ISO 9564 Format 2
 */
function buildChangePinApdu(oldPin: string, newPin: string): Buffer {
    const oldPinBlock = buildPinBlock(oldPin);
    const newPinBlock = buildPinBlock(newPin);

    return Buffer.from([
        0x00, // CLA
        0x24, // INS: CHANGE REFERENCE DATA
        0x00, // P1
        0x80, // P2: plaintext PIN
        0x10, // Lc: 16 bytes (2 x 8-byte PIN blocks)
        ...oldPinBlock,
        ...newPinBlock,
    ]);
}

/**
 * EMV Application for interacting with chip cards via PC/SC readers.
 *
 * @example
 * ```typescript
 * import { Devices } from 'smartcard';
 * import { EmvApplication, format } from 'emv';
 *
 * const devices = new Devices();
 *
 * devices.on('card-inserted', async ({ reader, card }) => {
 *     const emv = new EmvApplication(reader, card);
 *     const response = await emv.selectPse();
 *     console.log(format(response));
 * });
 *
 * devices.start();
 * ```
 */
export class EmvApplication {
    readonly #card: SmartCard;
    readonly #reader: Reader;

    constructor(reader: Reader, card: SmartCard) {
        this.#reader = reader;
        this.#card = card;
    }

    /**
     * Transmit an APDU with automatic T=0 protocol handling
     */
    async #transmit(apdu: Buffer): Promise<Buffer> {
        return this.#card.transmit(apdu, { autoGetResponse: true });
    }

    /**
     * Select the Payment System Environment (PSE) directory.
     * This is typically the first command sent to a payment card.
     */
    async selectPse(): Promise<CardResponse> {
        const apdu = buildSelectApdu(PSE);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Select an EMV application by its AID.
     * @param aid - Application Identifier (5-16 bytes)
     */
    async selectApplication(aid: Buffer | readonly number[]): Promise<CardResponse> {
        const aidBuffer = Buffer.isBuffer(aid) ? aid : Buffer.from(aid);

        if (aidBuffer.length < 5 || aidBuffer.length > 16) {
            throw new RangeError('AID must be between 5 and 16 bytes');
        }

        const apdu = buildSelectApdu(aidBuffer);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Read a record from a Short File Identifier (SFI).
     * @param sfi - Short File Identifier (1-30)
     * @param record - Record number (0-255)
     */
    async readRecord(sfi: number, record: number): Promise<CardResponse> {
        if (!Number.isInteger(sfi) || sfi < 1 || sfi > 30) {
            throw new RangeError('SFI must be an integer between 1 and 30');
        }

        if (!Number.isInteger(record) || record < 0 || record > 255) {
            throw new RangeError('Record number must be an integer between 0 and 255');
        }

        const apdu = buildReadRecordApdu(sfi, record);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Verify the cardholder PIN (plaintext).
     * @param pin - PIN code as a string of 4-12 digits
     * @returns CardResponse with status words indicating success or failure:
     *   - SW 9000: PIN verified successfully
     *   - SW 63CX: Wrong PIN, X attempts remaining
     *   - SW 6983: PIN blocked (too many failed attempts)
     *   - SW 6984: PIN not initialized
     */
    async verifyPin(pin: string): Promise<CardResponse> {
        if (!/^\d{4,12}$/.test(pin)) {
            throw new RangeError('PIN must be a string of 4-12 digits');
        }

        const apdu = buildVerifyPinApdu(pin);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Change the cardholder PIN (plaintext).
     *
     * **Note:** Most payment cards restrict PIN change to specific environments
     * (ATM, bank terminal). This method is primarily useful for test cards.
     *
     * @param oldPin - Current PIN code as a string of 4-12 digits
     * @param newPin - New PIN code as a string of 4-12 digits
     * @returns CardResponse with status words indicating success or failure:
     *   - SW 9000: PIN changed successfully
     *   - SW 63CX: Wrong old PIN, X attempts remaining
     *   - SW 6983: PIN blocked (too many failed attempts)
     *   - SW 6984: PIN not initialized
     */
    async changePin(oldPin: string, newPin: string): Promise<CardResponse> {
        if (!/^\d{4,12}$/.test(oldPin)) {
            throw new RangeError('Old PIN must be a string of 4-12 digits');
        }
        if (!/^\d{4,12}$/.test(newPin)) {
            throw new RangeError('New PIN must be a string of 4-12 digits');
        }

        const apdu = buildChangePinApdu(oldPin, newPin);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Get data element from the card by tag.
     * @param tag - EMV tag (1-2 bytes, e.g., 0x9F17 for PIN Try Counter)
     * @returns CardResponse with the requested data or error status:
     *   - SW 9000: Success, data returned
     *   - SW 6A88: Referenced data not found
     */
    async getData(tag: number): Promise<CardResponse> {
        if (!Number.isInteger(tag) || tag < 0 || tag > 0xffff) {
            throw new RangeError('Tag must be a positive integer (0x0000-0xFFFF)');
        }

        const apdu = buildGetDataApdu(tag);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Initiate transaction processing (GET PROCESSING OPTIONS).
     * @param pdolData - Optional PDOL (Processing Data Object List) values
     * @returns CardResponse containing AIP and AFL on success:
     *   - SW 9000: Success, AIP and AFL returned
     *   - SW 6985: Conditions of use not satisfied
     */
    async getProcessingOptions(pdolData?: Buffer | readonly number[]): Promise<CardResponse> {
        const data = pdolData
            ? (Buffer.isBuffer(pdolData) ? pdolData : Buffer.from(pdolData))
            : Buffer.alloc(0);

        const apdu = buildGpoApdu(data);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Generate an Application Cryptogram for transaction authorization.
     * @param cryptogramType - Type of cryptogram to generate:
     *   - 0x00: AAC (Application Authentication Cryptogram) - decline
     *   - 0x40: TC (Transaction Certificate) - approve offline
     *   - 0x80: ARQC (Authorization Request Cryptogram) - go online
     * @param cdolData - CDOL (Card Data Object List) data
     * @returns CardResponse containing the cryptogram on success
     */
    async generateAc(
        cryptogramType: number,
        cdolData: Buffer | readonly number[]
    ): Promise<CardResponse> {
        if (cryptogramType !== 0x00 && cryptogramType !== 0x40 && cryptogramType !== 0x80) {
            throw new RangeError('Cryptogram type must be AAC (0x00), TC (0x40), or ARQC (0x80)');
        }

        const data = Buffer.isBuffer(cdolData) ? cdolData : Buffer.from(cdolData);
        if (data.length === 0) {
            throw new RangeError('CDOL data must not be empty');
        }

        const apdu = buildGenerateAcApdu(cryptogramType, data);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Perform internal authentication for Dynamic Data Authentication (DDA).
     * @param authData - Authentication data (typically unpredictable number from terminal)
     * @returns CardResponse containing signed dynamic application data
     */
    async internalAuthenticate(authData: Buffer | readonly number[]): Promise<CardResponse> {
        const data = Buffer.isBuffer(authData) ? authData : Buffer.from(authData);
        if (data.length === 0) {
            throw new RangeError('Authentication data must not be empty');
        }

        const apdu = buildInternalAuthenticateApdu(data);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Get the card's ATR (Answer To Reset)
     */
    getAtr(): string {
        return this.#card.atr.toString('hex');
    }

    /**
     * Get the reader name
     */
    getReaderName(): string {
        return this.#reader.name;
    }

    /**
     * Perform a complete EMV transaction flow.
     * This orchestrates: GPO → Read Records → Generate AC
     *
     * @param options - Transaction options including amount and currency
     * @returns TransactionResult with cryptogram and card data
     */
    async performTransaction(options: TransactionOptions): Promise<TransactionResult> {
        const {
            amount,
            currencyCode,
            transactionType = 0x00,
            cryptogramType = 'ARQC',
            pdolValues = new Map<number, Buffer>(),
            cdolValues = new Map<number, Buffer>(),
        } = options;

        // Build default tag values for PDOL
        const defaultPdolValues = new Map<number, Buffer>([
            [0x9f02, amountToBcd(amount)],                                    // Amount, Authorized
            [0x9f03, Buffer.alloc(6)],                                        // Amount, Other
            [0x9f1a, Buffer.from([(currencyCode >> 8) & 0xff, currencyCode & 0xff])], // Terminal Country Code
            [0x5f2a, Buffer.from([(currencyCode >> 8) & 0xff, currencyCode & 0xff])], // Transaction Currency Code
            [0x9a, getCurrentDateBcd()],                                      // Transaction Date
            [0x9c, Buffer.from([transactionType])],                           // Transaction Type
            [0x9f37, Buffer.from([Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256].map(Math.floor))], // Unpredictable Number
            [0x9f35, Buffer.from([0x22])],                                    // Terminal Type
            [0x9f45, Buffer.alloc(2)],                                        // Data Authentication Code
            [0x9f34, Buffer.from([0x00, 0x00, 0x00])],                         // CVM Results
            [0x9f66, Buffer.from([0x86, 0x00, 0x00, 0x00])],                   // TTQ (Terminal Transaction Qualifiers)
        ]);

        // Merge with user-provided values
        pdolValues.forEach((value, tag) => {
            defaultPdolValues.set(tag, value);
        });

        // Step 1: GET PROCESSING OPTIONS
        // For simplicity, we'll use empty PDOL data if card doesn't require specific data
        const gpoResponse = await this.getProcessingOptions();

        if (!gpoResponse.isOk()) {
            return {
                success: false,
                error: `GPO failed with SW ${gpoResponse.sw1.toString(16).padStart(2, '0')}${gpoResponse.sw2.toString(16).padStart(2, '0')}`,
            };
        }

        // Parse GPO response - Format 1 (tag 80) or Format 2 (tag 77)
        let aip: Buffer | undefined;
        let aflBuffer: Buffer | undefined;

        const responseData = gpoResponse.buffer;
        if (responseData[0] === 0x80) {
            // Format 1: 80 len AIP(2) AFL(var)
            const len = responseData[1];
            if (len !== undefined && len >= 2) {
                aip = responseData.subarray(2, 4);
                aflBuffer = responseData.subarray(4, 2 + len);
            }
        } else if (responseData[0] === 0x77) {
            // Format 2: look for tags 82 (AIP) and 94 (AFL)
            aip = findTagInBuffer(responseData, 0x82);
            aflBuffer = findTagInBuffer(responseData, 0x94);
        }

        const afl = aflBuffer ? parseAfl(aflBuffer) : [];

        // Step 2: Read records from AFL
        const records: Buffer[] = [];
        for (const entry of afl) {
            for (let rec = entry.firstRecord; rec <= entry.lastRecord; rec++) {
                const recordResponse = await this.readRecord(entry.sfi, rec);
                if (recordResponse.isOk()) {
                    records.push(recordResponse.buffer);
                }
            }
        }

        // Step 3: Build CDOL data and Generate AC
        // Use a minimal CDOL if we don't have the actual CDOL from the card
        const defaultCdolValues = new Map<number, Buffer>([
            [0x9f02, amountToBcd(amount)],                                    // Amount, Authorized
            [0x9f03, Buffer.alloc(6)],                                        // Amount, Other
            [0x9f1a, Buffer.from([(currencyCode >> 8) & 0xff, currencyCode & 0xff])], // Terminal Country Code
            [0x95, Buffer.alloc(5)],                                          // TVR
            [0x5f2a, Buffer.from([(currencyCode >> 8) & 0xff, currencyCode & 0xff])], // Transaction Currency Code
            [0x9a, getCurrentDateBcd()],                                      // Transaction Date
            [0x9c, Buffer.from([transactionType])],                           // Transaction Type
            [0x9f37, Buffer.from([Math.random() * 256, Math.random() * 256, Math.random() * 256, Math.random() * 256].map(Math.floor))], // Unpredictable Number
            [0x82, aip ?? Buffer.alloc(2)],                                   // AIP
            [0x9f36, Buffer.alloc(2)],                                        // ATC (placeholder)
        ]);

        // Merge with user-provided values
        cdolValues.forEach((value, tag) => {
            defaultCdolValues.set(tag, value);
        });

        // Build a minimal CDOL data buffer (common fields)
        const cdolData = Buffer.concat([
            defaultCdolValues.get(0x9f02) ?? Buffer.alloc(6),  // Amount
            defaultCdolValues.get(0x9f03) ?? Buffer.alloc(6),  // Other Amount
            defaultCdolValues.get(0x9f1a) ?? Buffer.alloc(2),  // Country Code
            defaultCdolValues.get(0x95) ?? Buffer.alloc(5),    // TVR
            defaultCdolValues.get(0x5f2a) ?? Buffer.alloc(2),  // Currency
            defaultCdolValues.get(0x9a) ?? Buffer.alloc(3),    // Date
            defaultCdolValues.get(0x9c) ?? Buffer.alloc(1),    // Type
            defaultCdolValues.get(0x9f37) ?? Buffer.alloc(4),  // Unpredictable Number
        ]);

        const cryptogramByte = cryptogramTypeToByte(cryptogramType);
        const acResponse = await this.generateAc(cryptogramByte, cdolData);

        if (!acResponse.isOk()) {
            return {
                success: false,
                error: `Generate AC failed with SW ${acResponse.sw1.toString(16).padStart(2, '0')}${acResponse.sw2.toString(16).padStart(2, '0')}`,
                aip,
                afl,
                records,
            };
        }

        // Parse Generate AC response
        const cid = findTagInBuffer(acResponse.buffer, 0x9f27);
        const cryptogram = findTagInBuffer(acResponse.buffer, 0x9f26);
        const atcBuffer = findTagInBuffer(acResponse.buffer, 0x9f36);

        const returnedCryptogramType = cid && cid[0] !== undefined ? byteToCryptogramType(cid[0]) : undefined;
        const atc = atcBuffer && atcBuffer.length >= 2 ? atcBuffer.readUInt16BE(0) : undefined;

        return {
            success: true,
            aip,
            afl,
            records,
            cryptogramType: returnedCryptogramType,
            cryptogram,
            atc,
            generateAcResponse: acResponse.buffer,
        };
    }
}

/**
 * Factory function to create an EmvApplication instance
 */
export function createEmvApplication(reader: Reader, card: SmartCard): EmvApplication {
    return new EmvApplication(reader, card);
}

export default createEmvApplication;
