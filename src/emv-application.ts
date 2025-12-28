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
