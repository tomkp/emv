import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { EmvApplication, createEmvApplication } from './index.js';
import type { Reader, SmartCard } from './types.js';

describe('EmvApplication', () => {
    let emv: EmvApplication;
    let mockReader: Reader;
    let mockCard: SmartCard;
    let transmitCalls: Buffer[];

    beforeEach(() => {
        transmitCalls = [];
        mockReader = { name: 'Test Reader' };
        mockCard = {
            atr: Buffer.from([0x3b, 0x8f, 0x80, 0x01]),
            transmit: async (apdu) => {
                transmitCalls.push(Buffer.isBuffer(apdu) ? apdu : Buffer.from(apdu));
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
            assert.ok(apdu);
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
            const longAid = new Array(17).fill(0xa0) as number[];
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
            assert.ok(apdu);
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
                transmitCalls.push(Buffer.isBuffer(apdu) ? apdu : Buffer.from(apdu));
                return Buffer.from([0x6a, 0x83]);
            };
            await emv.readRecord(1, 1);
            const apdu = transmitCalls[0];
            assert.ok(apdu);
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

    describe('verifyPin', () => {
        it('should throw RangeError for PIN shorter than 4 digits', async () => {
            await assert.rejects(
                () => emv.verifyPin('123'),
                /PIN must be a string of 4-12 digits/
            );
        });

        it('should throw RangeError for PIN longer than 12 digits', async () => {
            await assert.rejects(
                () => emv.verifyPin('1234567890123'),
                /PIN must be a string of 4-12 digits/
            );
        });

        it('should throw RangeError for non-numeric PIN', async () => {
            await assert.rejects(
                () => emv.verifyPin('12ab'),
                /PIN must be a string of 4-12 digits/
            );
        });

        it('should transmit VERIFY APDU with correct format', async () => {
            await emv.verifyPin('1234');
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[0], 0x00); // CLA
            assert.strictEqual(apdu[1], 0x20); // INS: VERIFY
            assert.strictEqual(apdu[2], 0x00); // P1
            assert.strictEqual(apdu[3], 0x80); // P2: plaintext PIN
            assert.strictEqual(apdu[4], 0x08); // Lc: 8 bytes
        });

        it('should encode 4-digit PIN correctly in BCD format', async () => {
            await emv.verifyPin('1234');
            const apdu = transmitCalls[0];
            assert.ok(apdu);

            // PIN block: 0x24 (length=4) + 0x12 0x34 0xFF 0xFF 0xFF 0xFF 0xFF
            assert.strictEqual(apdu[5], 0x24); // 0x20 | 4
            assert.strictEqual(apdu[6], 0x12);
            assert.strictEqual(apdu[7], 0x34);
            assert.strictEqual(apdu[8], 0xff);
            assert.strictEqual(apdu[9], 0xff);
            assert.strictEqual(apdu[10], 0xff);
            assert.strictEqual(apdu[11], 0xff);
            assert.strictEqual(apdu[12], 0xff);
        });

        it('should encode 6-digit PIN correctly', async () => {
            await emv.verifyPin('123456');
            const apdu = transmitCalls[0];
            assert.ok(apdu);

            // PIN block: 0x26 (length=6) + 0x12 0x34 0x56 0xFF 0xFF 0xFF 0xFF
            assert.strictEqual(apdu[5], 0x26);
            assert.strictEqual(apdu[6], 0x12);
            assert.strictEqual(apdu[7], 0x34);
            assert.strictEqual(apdu[8], 0x56);
            assert.strictEqual(apdu[9], 0xff);
        });

        it('should return success for correct PIN', async () => {
            mockCard.transmit = async () => Buffer.from([0x90, 0x00]);
            const response = await emv.verifyPin('1234');
            assert.strictEqual(response.isOk(), true);
            assert.strictEqual(response.sw1, 0x90);
            assert.strictEqual(response.sw2, 0x00);
        });

        it('should return wrong PIN status with remaining attempts', async () => {
            // 63C2 = wrong PIN, 2 attempts remaining
            mockCard.transmit = async () => Buffer.from([0x63, 0xc2]);
            const response = await emv.verifyPin('0000');
            assert.strictEqual(response.isOk(), false);
            assert.strictEqual(response.sw1, 0x63);
            assert.strictEqual(response.sw2, 0xc2);
        });

        it('should return PIN blocked status', async () => {
            // 6983 = PIN blocked
            mockCard.transmit = async () => Buffer.from([0x69, 0x83]);
            const response = await emv.verifyPin('0000');
            assert.strictEqual(response.isOk(), false);
            assert.strictEqual(response.sw1, 0x69);
            assert.strictEqual(response.sw2, 0x83);
        });
    });

    describe('getData', () => {
        it('should throw RangeError for tag less than 0', async () => {
            await assert.rejects(
                () => emv.getData(-1),
                /Tag must be a positive integer/
            );
        });

        it('should throw RangeError for tag greater than 0xFFFF', async () => {
            await assert.rejects(
                () => emv.getData(0x10000),
                /Tag must be a positive integer/
            );
        });

        it('should transmit GET DATA APDU with 1-byte tag', async () => {
            await emv.getData(0x9f);
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[0], 0x80); // CLA
            assert.strictEqual(apdu[1], 0xca); // INS: GET DATA
            assert.strictEqual(apdu[2], 0x00); // P1: high byte of tag
            assert.strictEqual(apdu[3], 0x9f); // P2: low byte of tag
            assert.strictEqual(apdu[4], 0x00); // Le
        });

        it('should transmit GET DATA APDU with 2-byte tag', async () => {
            // 0x9F17 = PIN Try Counter
            await emv.getData(0x9f17);
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[0], 0x80); // CLA
            assert.strictEqual(apdu[1], 0xca); // INS: GET DATA
            assert.strictEqual(apdu[2], 0x9f); // P1: high byte of tag
            assert.strictEqual(apdu[3], 0x17); // P2: low byte of tag
            assert.strictEqual(apdu[4], 0x00); // Le
        });

        it('should return PIN try counter data', async () => {
            // Response: 9F17 01 03 (PIN try counter = 3)
            mockCard.transmit = async () => Buffer.from([0x9f, 0x17, 0x01, 0x03, 0x90, 0x00]);
            const response = await emv.getData(0x9f17);
            assert.strictEqual(response.isOk(), true);
            assert.strictEqual(response.buffer.toString('hex'), '9f170103');
        });

        it('should return data not found status', async () => {
            // 6A88 = Referenced data not found
            mockCard.transmit = async () => Buffer.from([0x6a, 0x88]);
            const response = await emv.getData(0x9f99);
            assert.strictEqual(response.isOk(), false);
            assert.strictEqual(response.sw1, 0x6a);
            assert.strictEqual(response.sw2, 0x88);
        });
    });

    describe('getProcessingOptions', () => {
        it('should transmit GPO APDU with empty PDOL', async () => {
            await emv.getProcessingOptions();
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[0], 0x80); // CLA
            assert.strictEqual(apdu[1], 0xa8); // INS: GET PROCESSING OPTIONS
            assert.strictEqual(apdu[2], 0x00); // P1
            assert.strictEqual(apdu[3], 0x00); // P2
            assert.strictEqual(apdu[4], 0x02); // Lc: 2 bytes (tag 83 + length 0)
            assert.strictEqual(apdu[5], 0x83); // Tag 83
            assert.strictEqual(apdu[6], 0x00); // Length 0
            assert.strictEqual(apdu[7], 0x00); // Le
        });

        it('should transmit GPO APDU with PDOL data', async () => {
            const pdolData = Buffer.from([0x01, 0x02, 0x03, 0x04]);
            await emv.getProcessingOptions(pdolData);
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[0], 0x80); // CLA
            assert.strictEqual(apdu[1], 0xa8); // INS: GET PROCESSING OPTIONS
            assert.strictEqual(apdu[4], 0x06); // Lc: 6 bytes (tag 83 + length 4 + data)
            assert.strictEqual(apdu[5], 0x83); // Tag 83
            assert.strictEqual(apdu[6], 0x04); // Length 4
            assert.strictEqual(apdu[7], 0x01); // Data
            assert.strictEqual(apdu[8], 0x02);
            assert.strictEqual(apdu[9], 0x03);
            assert.strictEqual(apdu[10], 0x04);
        });

        it('should accept PDOL data as array', async () => {
            await emv.getProcessingOptions([0xaa, 0xbb]);
            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[6], 0x02); // Length 2
            assert.strictEqual(apdu[7], 0xaa);
            assert.strictEqual(apdu[8], 0xbb);
        });

        it('should return AIP and AFL on success', async () => {
            // Format 1 response: 80 06 1C00 08010100
            mockCard.transmit = async () => Buffer.from([
                0x80, 0x06, 0x1c, 0x00, 0x08, 0x01, 0x01, 0x00, 0x90, 0x00
            ]);
            const response = await emv.getProcessingOptions();
            assert.strictEqual(response.isOk(), true);
            assert.strictEqual(response.buffer.toString('hex'), '80061c0008010100');
        });

        it('should return conditions not satisfied error', async () => {
            // 6985 = Conditions of use not satisfied
            mockCard.transmit = async () => Buffer.from([0x69, 0x85]);
            const response = await emv.getProcessingOptions();
            assert.strictEqual(response.isOk(), false);
            assert.strictEqual(response.sw1, 0x69);
            assert.strictEqual(response.sw2, 0x85);
        });
    });
});
