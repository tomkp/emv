import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { EmvApplication, createEmvApplication } from '../dist/index.js';

describe('EmvApplication', () => {
    /** @type {EmvApplication} */
    let emv;
    /** @type {{ name: string }} */
    let mockReader;
    /** @type {{ atr: Buffer, transmit: (apdu: Buffer) => Promise<Buffer> }} */
    let mockCard;
    /** @type {Buffer[]} */
    let transmitCalls;

    beforeEach(() => {
        transmitCalls = [];
        mockReader = { name: 'Test Reader' };
        mockCard = {
            atr: Buffer.from([0x3b, 0x8f, 0x80, 0x01]),
            transmit: async (apdu) => {
                transmitCalls.push(apdu);
                return Buffer.from([0x6f, 0x00, 0x90, 0x00]);
            },
        };
        emv = new EmvApplication(mockReader, mockCard);
    });

    describe('constructor', () => {
        it('should create an instance', () => {
            assert.ok(emv instanceof EmvApplication);
        });
    });

    describe('createEmvApplication', () => {
        it('should create an EmvApplication instance', () => {
            const instance = createEmvApplication(mockReader, mockCard);
            assert.ok(instance instanceof EmvApplication);
        });
    });

    describe('getAtr', () => {
        it('should return ATR as hex string', () => {
            assert.strictEqual(emv.getAtr(), '3b8f8001');
        });
    });

    describe('getReaderName', () => {
        it('should return reader name', () => {
            assert.strictEqual(emv.getReaderName(), 'Test Reader');
        });
    });

    describe('selectPse', () => {
        it('should transmit SELECT APDU for PSE', async () => {
            const response = await emv.selectPse();
            assert.ok(response);
            assert.strictEqual(response.isOk(), true);
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.strictEqual(apdu[0], 0x00); // CLA
            assert.strictEqual(apdu[1], 0xa4); // INS: SELECT
            assert.strictEqual(apdu[2], 0x04); // P1
            assert.strictEqual(apdu[3], 0x00); // P2
        });

        it('should parse response correctly', async () => {
            mockCard.transmit = async () => Buffer.from([0x6f, 0x0a, 0x84, 0x07, 0x90, 0x00]);
            const response = await emv.selectPse();
            assert.strictEqual(response.sw1, 0x90);
            assert.strictEqual(response.sw2, 0x00);
            assert.strictEqual(response.buffer.toString('hex'), '6f0a8407');
        });
    });

    describe('selectApplication', () => {
        it('should throw RangeError for AID shorter than 5 bytes', async () => {
            await assert.rejects(
                () => emv.selectApplication([0xa0, 0x00, 0x00, 0x00]),
                /AID must be between 5 and 16 bytes/
            );
        });

        it('should throw RangeError for AID longer than 16 bytes', async () => {
            const longAid = new Array(17).fill(0xa0);
            await assert.rejects(
                () => emv.selectApplication(longAid),
                /AID must be between 5 and 16 bytes/
            );
        });

        it('should accept valid AID as array', async () => {
            const aid = [0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10];
            const response = await emv.selectApplication(aid);
            assert.ok(response);
        });

        it('should accept valid AID as Buffer', async () => {
            const aid = Buffer.from([0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10]);
            const response = await emv.selectApplication(aid);
            assert.ok(response);
        });

        it('should include AID in APDU', async () => {
            const aid = [0xa0, 0x00, 0x00, 0x00, 0x04];
            await emv.selectApplication(aid);
            const apdu = transmitCalls[0];
            assert.strictEqual(apdu[4], 5); // Lc = length of AID
            assert.strictEqual(apdu.subarray(5, 10).toString('hex'), 'a000000004');
        });
    });

    describe('readRecord', () => {
        it('should throw RangeError for SFI less than 1', async () => {
            await assert.rejects(
                () => emv.readRecord(0, 1),
                /SFI must be an integer between 1 and 30/
            );
        });

        it('should throw RangeError for SFI greater than 30', async () => {
            await assert.rejects(
                () => emv.readRecord(31, 1),
                /SFI must be an integer between 1 and 30/
            );
        });

        it('should throw RangeError for negative record number', async () => {
            await assert.rejects(
                () => emv.readRecord(1, -1),
                /Record number must be an integer between 0 and 255/
            );
        });

        it('should throw RangeError for record number greater than 255', async () => {
            await assert.rejects(
                () => emv.readRecord(1, 256),
                /Record number must be an integer between 0 and 255/
            );
        });

        it('should accept valid SFI and record values', async () => {
            const response = await emv.readRecord(1, 1);
            assert.ok(response);
        });

        it('should encode SFI correctly in P2', async () => {
            mockCard.transmit = async (apdu) => {
                transmitCalls.push(apdu);
                return Buffer.from([0x6a, 0x83]);
            };
            await emv.readRecord(1, 1);
            const apdu = transmitCalls[0];
            assert.strictEqual(apdu[0], 0x00); // CLA
            assert.strictEqual(apdu[1], 0xb2); // INS: READ RECORD
            assert.strictEqual(apdu[2], 1); // P1: record number
            assert.strictEqual(apdu[3], (1 << 3) | 0x04); // P2: SFI=1
        });

        it('should return non-OK response for error status words', async () => {
            mockCard.transmit = async () => Buffer.from([0x6a, 0x83]);
            const response = await emv.readRecord(1, 1);
            assert.strictEqual(response.isOk(), false);
            assert.strictEqual(response.sw1, 0x6a);
            assert.strictEqual(response.sw2, 0x83);
        });
    });
});
