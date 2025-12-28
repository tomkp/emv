import iso7816 from 'iso7816';
import type { CardReader, CardResponse, Iso7816 } from './types.js';

/**
 * Payment System Environment (PSE) identifier
 * "1PAY.SYS.DDF01" encoded as bytes
 */
const PSE = Buffer.from([
    0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e, 0x44, 0x44, 0x46, 0x30, 0x31,
]);

/**
 * EMV Application for interacting with chip cards via PC/SC readers.
 */
export class EmvApplication {
    readonly #iso7816: Iso7816;

    constructor(devices: unknown, cardReader: CardReader) {
        this.#iso7816 = iso7816(devices, cardReader) as Iso7816;
    }

    /**
     * Select the Payment System Environment (PSE) directory.
     * This is typically the first command sent to a payment card.
     */
    selectPse(): Promise<CardResponse> {
        return this.#iso7816.selectFile(PSE);
    }

    /**
     * Select an EMV application by its AID.
     * @param aid - Application Identifier (5-16 bytes)
     */
    selectApplication(aid: Buffer | readonly number[]): Promise<CardResponse> {
        const aidBuffer = Buffer.isBuffer(aid) ? aid : Buffer.from(aid);

        if (aidBuffer.length < 5 || aidBuffer.length > 16) {
            throw new RangeError('AID must be between 5 and 16 bytes');
        }

        return this.#iso7816.selectFile(aidBuffer);
    }

    /**
     * Read a record from a Short File Identifier (SFI).
     * @param sfi - Short File Identifier (1-30)
     * @param record - Record number (0-255)
     */
    readRecord(sfi: number, record: number): Promise<CardResponse> {
        if (!Number.isInteger(sfi) || sfi < 1 || sfi > 30) {
            throw new RangeError('SFI must be an integer between 1 and 30');
        }

        if (!Number.isInteger(record) || record < 0 || record > 255) {
            throw new RangeError('Record number must be an integer between 0 and 255');
        }

        return this.#iso7816.readRecord(sfi, record);
    }
}

/**
 * Factory function to create an EmvApplication instance
 */
export function createEmvApplication(devices: unknown, cardReader: CardReader): EmvApplication {
    return new EmvApplication(devices, cardReader);
}

export default createEmvApplication;
