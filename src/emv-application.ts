import type { CardResponse, SmartCard, Reader } from './types.js';

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
 * Build VERIFY PIN APDU command
 * PIN is encoded in ISO 9564 Format 2 (BCD with 0xF padding)
 */
function buildVerifyPinApdu(pin: string): Buffer {
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
     * Select the Payment System Environment (PSE) directory.
     * This is typically the first command sent to a payment card.
     */
    async selectPse(): Promise<CardResponse> {
        const apdu = buildSelectApdu(PSE);
        const response = await this.#card.transmit(apdu);
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
        const response = await this.#card.transmit(apdu);
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
        const response = await this.#card.transmit(apdu);
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
        const response = await this.#card.transmit(apdu);
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
        const response = await this.#card.transmit(apdu);
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
        const response = await this.#card.transmit(apdu);
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
        const response = await this.#card.transmit(apdu);
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
        const response = await this.#card.transmit(apdu);
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
}

/**
 * Factory function to create an EmvApplication instance
 */
export function createEmvApplication(reader: Reader, card: SmartCard): EmvApplication {
    return new EmvApplication(reader, card);
}

export default createEmvApplication;
