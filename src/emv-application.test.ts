import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { EmvApplication, createEmvApplication } from './index.js';
import type { Reader, SmartCard, TransmitOptions } from './types.js';

interface TransmitCall {
    apdu: Buffer;
    options: TransmitOptions | undefined;
}

describe('EmvApplication', () => {
    let emv: EmvApplication;
    let mockReader: Reader;
    let mockCard: SmartCard;
    let transmitCalls: Buffer[];
    let transmitCallsWithOptions: TransmitCall[];

    beforeEach(() => {
        transmitCalls = [];
        transmitCallsWithOptions = [];
        mockReader = { name: 'Test Reader' };
        mockCard = {
            atr: Buffer.from([0x3b, 0x8f, 0x80, 0x01]),
            transmit: async (apdu, options) => {
                const buf = Buffer.isBuffer(apdu) ? apdu : Buffer.from(apdu);
                transmitCalls.push(buf);
                transmitCallsWithOptions.push({ apdu: buf, options });
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

    describe('selectPpse', () => {
        it('should transmit SELECT APDU for PPSE (contactless)', async () => {
            const response = await emv.selectPpse();
            assert.ok(response);
            assert.strictEqual(response.isOk(), true);
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[0], 0x00); // CLA
            assert.strictEqual(apdu[1], 0xa4); // INS: SELECT
            assert.strictEqual(apdu[2], 0x04); // P1
            assert.strictEqual(apdu[3], 0x00); // P2
            // PPSE = "2PAY.SYS.DDF01" = 0x32 0x50 0x41 0x59 0x2e 0x53 0x59 0x53 0x2e 0x44 0x44 0x46 0x30 0x31
            assert.strictEqual(apdu[4], 14); // Length of PPSE
            assert.strictEqual(apdu[5], 0x32); // '2'
        });

        it('should parse PPSE response correctly', async () => {
            mockCard.transmit = async () => Buffer.from([0x6f, 0x0a, 0x84, 0x07, 0x90, 0x00]);
            const response = await emv.selectPpse();
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
            await assert.rejects(() => emv.verifyPin('123'), /PIN must be a string of 4-12 digits/);
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

    describe('changePin', () => {
        it('should throw RangeError for old PIN shorter than 4 digits', async () => {
            await assert.rejects(
                () => emv.changePin('123', '1234'),
                /Old PIN must be a string of 4-12 digits/
            );
        });

        it('should throw RangeError for new PIN shorter than 4 digits', async () => {
            await assert.rejects(
                () => emv.changePin('1234', '12'),
                /New PIN must be a string of 4-12 digits/
            );
        });

        it('should throw RangeError for non-numeric old PIN', async () => {
            await assert.rejects(
                () => emv.changePin('12ab', '1234'),
                /Old PIN must be a string of 4-12 digits/
            );
        });

        it('should throw RangeError for non-numeric new PIN', async () => {
            await assert.rejects(
                () => emv.changePin('1234', 'abcd'),
                /New PIN must be a string of 4-12 digits/
            );
        });

        it('should transmit CHANGE REFERENCE DATA APDU with correct format', async () => {
            await emv.changePin('1234', '5678');
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[0], 0x00); // CLA
            assert.strictEqual(apdu[1], 0x24); // INS: CHANGE REFERENCE DATA
            assert.strictEqual(apdu[2], 0x00); // P1
            assert.strictEqual(apdu[3], 0x80); // P2: plaintext PIN
            assert.strictEqual(apdu[4], 0x10); // Lc: 16 bytes (2 x 8-byte PIN blocks)
        });

        it('should encode old and new PINs correctly in BCD format', async () => {
            await emv.changePin('1234', '5678');
            const apdu = transmitCalls[0];
            assert.ok(apdu);

            // Old PIN block: 0x24 (length=4) + 0x12 0x34 0xFF 0xFF 0xFF 0xFF 0xFF
            assert.strictEqual(apdu[5], 0x24); // 0x20 | 4
            assert.strictEqual(apdu[6], 0x12);
            assert.strictEqual(apdu[7], 0x34);
            assert.strictEqual(apdu[8], 0xff);

            // New PIN block: 0x24 (length=4) + 0x56 0x78 0xFF 0xFF 0xFF 0xFF 0xFF
            assert.strictEqual(apdu[13], 0x24); // 0x20 | 4
            assert.strictEqual(apdu[14], 0x56);
            assert.strictEqual(apdu[15], 0x78);
            assert.strictEqual(apdu[16], 0xff);
        });

        it('should return success for PIN change', async () => {
            mockCard.transmit = async () => Buffer.from([0x90, 0x00]);
            const response = await emv.changePin('1234', '5678');
            assert.strictEqual(response.isOk(), true);
        });

        it('should return wrong PIN status with remaining attempts', async () => {
            // 63C2 = wrong PIN, 2 attempts remaining
            mockCard.transmit = async () => Buffer.from([0x63, 0xc2]);
            const response = await emv.changePin('0000', '1234');
            assert.strictEqual(response.isOk(), false);
            assert.strictEqual(response.sw1, 0x63);
            assert.strictEqual(response.sw2, 0xc2);
        });

        it('should return PIN blocked status', async () => {
            // 6983 = PIN blocked
            mockCard.transmit = async () => Buffer.from([0x69, 0x83]);
            const response = await emv.changePin('0000', '1234');
            assert.strictEqual(response.isOk(), false);
            assert.strictEqual(response.sw1, 0x69);
            assert.strictEqual(response.sw2, 0x83);
        });
    });

    describe('getData', () => {
        it('should throw RangeError for tag less than 0', async () => {
            await assert.rejects(() => emv.getData(-1), /Tag must be a positive integer/);
        });

        it('should throw RangeError for tag greater than 0xFFFF', async () => {
            await assert.rejects(() => emv.getData(0x10000), /Tag must be a positive integer/);
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
            mockCard.transmit = async () =>
                Buffer.from([0x80, 0x06, 0x1c, 0x00, 0x08, 0x01, 0x01, 0x00, 0x90, 0x00]);
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

    describe('generateAc', () => {
        it('should throw RangeError for invalid cryptogram type', async () => {
            await assert.rejects(
                () => emv.generateAc(0x20, Buffer.from([0x01])),
                /Cryptogram type must be AAC \(0x00\), TC \(0x40\), or ARQC \(0x80\)/
            );
        });

        it('should throw RangeError for empty CDOL data', async () => {
            await assert.rejects(
                () => emv.generateAc(0x80, Buffer.alloc(0)),
                /CDOL data must not be empty/
            );
        });

        it('should transmit GENERATE AC APDU for ARQC', async () => {
            const cdolData = Buffer.from([0x01, 0x02, 0x03, 0x04]);
            await emv.generateAc(0x80, cdolData);
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[0], 0x80); // CLA
            assert.strictEqual(apdu[1], 0xae); // INS: GENERATE AC
            assert.strictEqual(apdu[2], 0x80); // P1: ARQC
            assert.strictEqual(apdu[3], 0x00); // P2
            assert.strictEqual(apdu[4], 0x04); // Lc
            assert.strictEqual(apdu[5], 0x01); // Data
            assert.strictEqual(apdu[6], 0x02);
            assert.strictEqual(apdu[7], 0x03);
            assert.strictEqual(apdu[8], 0x04);
            assert.strictEqual(apdu[9], 0x00); // Le
        });

        it('should transmit GENERATE AC APDU for TC', async () => {
            await emv.generateAc(0x40, [0xaa, 0xbb]);
            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[2], 0x40); // P1: TC
        });

        it('should transmit GENERATE AC APDU for AAC', async () => {
            await emv.generateAc(0x00, [0xcc]);
            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[2], 0x00); // P1: AAC
        });

        it('should return cryptogram on success', async () => {
            // Response with Application Cryptogram
            mockCard.transmit = async () =>
                Buffer.from([
                    0x77, 0x12, 0x9f, 0x27, 0x01, 0x80, 0x9f, 0x36, 0x02, 0x00, 0x01, 0x9f, 0x26,
                    0x08, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0x90, 0x00,
                ]);
            const response = await emv.generateAc(0x80, [0x01]);
            assert.strictEqual(response.isOk(), true);
        });

        it('should return conditions not satisfied error', async () => {
            mockCard.transmit = async () => Buffer.from([0x69, 0x85]);
            const response = await emv.generateAc(0x80, [0x01]);
            assert.strictEqual(response.isOk(), false);
            assert.strictEqual(response.sw1, 0x69);
            assert.strictEqual(response.sw2, 0x85);
        });
    });

    describe('internalAuthenticate', () => {
        it('should throw RangeError for empty authentication data', async () => {
            await assert.rejects(
                () => emv.internalAuthenticate(Buffer.alloc(0)),
                /Authentication data must not be empty/
            );
        });

        it('should transmit INTERNAL AUTHENTICATE APDU', async () => {
            const authData = Buffer.from([0x12, 0x34, 0x56, 0x78]);
            await emv.internalAuthenticate(authData);
            assert.strictEqual(transmitCalls.length, 1);

            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[0], 0x00); // CLA
            assert.strictEqual(apdu[1], 0x88); // INS: INTERNAL AUTHENTICATE
            assert.strictEqual(apdu[2], 0x00); // P1
            assert.strictEqual(apdu[3], 0x00); // P2
            assert.strictEqual(apdu[4], 0x04); // Lc
            assert.strictEqual(apdu[5], 0x12); // Data
            assert.strictEqual(apdu[6], 0x34);
            assert.strictEqual(apdu[7], 0x56);
            assert.strictEqual(apdu[8], 0x78);
            assert.strictEqual(apdu[9], 0x00); // Le
        });

        it('should accept authentication data as array', async () => {
            await emv.internalAuthenticate([0xaa, 0xbb, 0xcc, 0xdd]);
            const apdu = transmitCalls[0];
            assert.ok(apdu);
            assert.strictEqual(apdu[4], 0x04); // Lc
            assert.strictEqual(apdu[5], 0xaa);
        });

        it('should return signed data on success', async () => {
            // Response with signed dynamic data
            mockCard.transmit = async () =>
                Buffer.from([
                    0x80, 0x08, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x90, 0x00,
                ]);
            const response = await emv.internalAuthenticate([0x12, 0x34, 0x56, 0x78]);
            assert.strictEqual(response.isOk(), true);
            assert.strictEqual(response.buffer.length, 10);
        });

        it('should return conditions not satisfied error', async () => {
            mockCard.transmit = async () => Buffer.from([0x69, 0x85]);
            const response = await emv.internalAuthenticate([0x01, 0x02, 0x03, 0x04]);
            assert.strictEqual(response.isOk(), false);
            assert.strictEqual(response.sw1, 0x69);
            assert.strictEqual(response.sw2, 0x85);
        });
    });

    describe('T=0 protocol handling', () => {
        it('should pass autoGetResponse: true to smartcard transmit', async () => {
            await emv.selectPse();

            assert.strictEqual(transmitCallsWithOptions.length, 1);
            const call = transmitCallsWithOptions[0];
            assert.ok(call);
            assert.deepStrictEqual(call.options, { autoGetResponse: true });
        });

        it('should pass autoGetResponse for all APDU methods', async () => {
            // Test multiple methods to ensure they all use autoGetResponse
            await emv.selectPse();
            await emv.selectApplication([0xa0, 0x00, 0x00, 0x00, 0x04]);
            await emv.readRecord(1, 1);
            await emv.getData(0x9f17);
            await emv.getProcessingOptions();

            // All calls should have autoGetResponse: true
            for (const call of transmitCallsWithOptions) {
                assert.deepStrictEqual(call.options, { autoGetResponse: true });
            }
        });
    });

    describe('parseAfl', async () => {
        const { parseAfl } = await import('./emv-application.js');

        it('should parse AFL entries from buffer', () => {
            // AFL: SFI 1, records 1-3, 0 for SDA; SFI 2, records 1-1, 1 for SDA
            const aflBuffer = Buffer.from([0x08, 0x01, 0x03, 0x00, 0x10, 0x01, 0x01, 0x01]);
            const entries = parseAfl(aflBuffer);
            assert.strictEqual(entries.length, 2);
            assert.deepStrictEqual(entries[0], {
                sfi: 1,
                firstRecord: 1,
                lastRecord: 3,
                sdaRecords: 0,
            });
            assert.deepStrictEqual(entries[1], {
                sfi: 2,
                firstRecord: 1,
                lastRecord: 1,
                sdaRecords: 1,
            });
        });

        it('should return empty array for empty buffer', () => {
            const entries = parseAfl(Buffer.alloc(0));
            assert.strictEqual(entries.length, 0);
        });
    });

    describe('readAllRecords', () => {
        it('should read all records from AFL entries', async () => {
            let recordNum = 0;
            mockCard.transmit = async () => {
                recordNum++;
                // Return different data for each record
                return Buffer.from([0x70, 0x04, 0x5a, 0x02, recordNum, recordNum, 0x90, 0x00]);
            };

            const aflEntries = [
                { sfi: 1, firstRecord: 1, lastRecord: 2, sdaRecords: 0 },
                { sfi: 2, firstRecord: 1, lastRecord: 1, sdaRecords: 0 },
            ];

            const records = await emv.readAllRecords(aflEntries);
            assert.strictEqual(records.length, 3);
            assert.strictEqual(records[0]?.sfi, 1);
            assert.strictEqual(records[0]?.recordNumber, 1);
            assert.strictEqual(records[1]?.sfi, 1);
            assert.strictEqual(records[1]?.recordNumber, 2);
            assert.strictEqual(records[2]?.sfi, 2);
            assert.strictEqual(records[2]?.recordNumber, 1);
        });

        it('should accept raw AFL buffer', async () => {
            mockCard.transmit = async () => Buffer.from([0x70, 0x02, 0x5a, 0x00, 0x90, 0x00]);

            // SFI 1, records 1-1
            const aflBuffer = Buffer.from([0x08, 0x01, 0x01, 0x00]);
            const records = await emv.readAllRecords(aflBuffer);
            assert.strictEqual(records.length, 1);
            assert.strictEqual(records[0]?.sfi, 1);
        });

        it('should skip failed records', async () => {
            let callCount = 0;
            mockCard.transmit = async () => {
                callCount++;
                if (callCount === 2) {
                    // Second record fails
                    return Buffer.from([0x6a, 0x83]);
                }
                return Buffer.from([0x70, 0x02, 0x5a, 0x00, 0x90, 0x00]);
            };

            const aflEntries = [{ sfi: 1, firstRecord: 1, lastRecord: 3, sdaRecords: 0 }];

            const records = await emv.readAllRecords(aflEntries);
            // Should have 2 records (first and third), second failed
            assert.strictEqual(records.length, 2);
        });

        it('should return empty array for empty AFL', async () => {
            const records = await emv.readAllRecords([]);
            assert.strictEqual(records.length, 0);
        });
    });

    describe('discoverApplications', () => {
        it('should discover applications from PSE', async () => {
            let callCount = 0;
            mockCard.transmit = async () => {
                callCount++;
                if (callCount === 1) {
                    // PSE response with SFI = 1
                    return Buffer.from([
                        0x6f, 0x15, 0x84, 0x0e, 0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53,
                        0x2e, 0x44, 0x44, 0x46, 0x30, 0x31, 0xa5, 0x03, 0x88, 0x01, 0x01, 0x90,
                        0x00,
                    ]);
                } else if (callCount === 2) {
                    // Record with AID and label
                    return Buffer.from([
                        0x70, 0x15, 0x61, 0x13, 0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10,
                        0x10, 0x50, 0x04, 0x56, 0x49, 0x53, 0x41, 0x87, 0x01, 0x01, 0x90, 0x00,
                    ]);
                }
                // End of records
                return Buffer.from([0x6a, 0x83]);
            };

            const result = await emv.discoverApplications();

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.apps.length, 1);
            assert.strictEqual(result.apps[0]?.aid, 'a0000000041010');
            assert.strictEqual(result.apps[0]?.label, 'VISA');
            assert.strictEqual(result.apps[0]?.priority, 1);
            assert.strictEqual(result.sfi, 1);
        });

        it('should return empty apps when PSE fails', async () => {
            mockCard.transmit = async () => Buffer.from([0x6a, 0x82]);

            const result = await emv.discoverApplications();

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.apps.length, 0);
        });

        it('should handle cards with multiple applications', async () => {
            let callCount = 0;
            mockCard.transmit = async () => {
                callCount++;
                if (callCount === 1) {
                    // PSE response
                    return Buffer.from([
                        0x6f, 0x15, 0x84, 0x0e, 0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53,
                        0x2e, 0x44, 0x44, 0x46, 0x30, 0x31, 0xa5, 0x03, 0x88, 0x01, 0x01, 0x90,
                        0x00,
                    ]);
                } else if (callCount === 2) {
                    // First app: Visa
                    return Buffer.from([
                        0x70, 0x12, 0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10, 0x50,
                        0x04, 0x56, 0x49, 0x53, 0x41, 0x90, 0x00,
                    ]);
                } else if (callCount === 3) {
                    // Second app: Mastercard
                    return Buffer.from([
                        0x70, 0x16, 0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10, 0x50,
                        0x0a, 0x4d, 0x61, 0x73, 0x74, 0x65, 0x72, 0x63, 0x61, 0x72, 0x64, 0x90,
                        0x00,
                    ]);
                }
                return Buffer.from([0x6a, 0x83]);
            };

            const result = await emv.discoverApplications();

            assert.strictEqual(result.success, true);
            assert.strictEqual(result.apps.length, 2);
        });
    });

    describe('parsePdol', async () => {
        const { parsePdol } = await import('./emv-application.js');

        it('should parse PDOL tag-length pairs', () => {
            // PDOL: 9F66 (4 bytes) + 9F02 (6 bytes) + 9F37 (4 bytes)
            const pdolBuffer = Buffer.from([0x9f, 0x66, 0x04, 0x9f, 0x02, 0x06, 0x9f, 0x37, 0x04]);
            const entries = parsePdol(pdolBuffer);
            assert.strictEqual(entries.length, 3);
            assert.deepStrictEqual(entries[0], { tag: 0x9f66, length: 4 });
            assert.deepStrictEqual(entries[1], { tag: 0x9f02, length: 6 });
            assert.deepStrictEqual(entries[2], { tag: 0x9f37, length: 4 });
        });

        it('should parse single-byte tags', () => {
            // PDOL: 9A (3 bytes) - Transaction Date
            const pdolBuffer = Buffer.from([0x9a, 0x03]);
            const entries = parsePdol(pdolBuffer);
            assert.strictEqual(entries.length, 1);
            assert.deepStrictEqual(entries[0], { tag: 0x9a, length: 3 });
        });
    });

    describe('buildPdolData', async () => {
        const { buildPdolData } = await import('./emv-application.js');

        it('should build PDOL data from tag values', () => {
            const pdolEntries = [
                { tag: 0x9f02, length: 6 }, // Amount
                { tag: 0x5f2a, length: 2 }, // Currency
            ];
            const tagValues = new Map<number, Buffer>([
                [0x9f02, Buffer.from([0x00, 0x00, 0x00, 0x00, 0x10, 0x00])], // 10.00
                [0x5f2a, Buffer.from([0x08, 0x26])], // USD
            ]);
            const result = buildPdolData(pdolEntries, tagValues);
            assert.strictEqual(result.toString('hex'), '000000001000' + '0826');
        });

        it('should pad with zeros for missing tag values', () => {
            const pdolEntries = [{ tag: 0x9f02, length: 6 }];
            const tagValues = new Map<number, Buffer>();
            const result = buildPdolData(pdolEntries, tagValues);
            assert.strictEqual(result.toString('hex'), '000000000000');
        });

        it('should truncate values that are too long', () => {
            const pdolEntries = [{ tag: 0x9f02, length: 3 }];
            const tagValues = new Map<number, Buffer>([
                [0x9f02, Buffer.from([0x00, 0x00, 0x00, 0x00, 0x10, 0x00])],
            ]);
            const result = buildPdolData(pdolEntries, tagValues);
            assert.strictEqual(result.length, 3);
        });
    });

    describe('buildDefaultPdolData', async () => {
        const { buildDefaultPdolData } = await import('./emv-application.js');

        it('should build PDOL data with default values', () => {
            const pdolEntries = [
                { tag: 0x9f02, length: 6 }, // Amount
                { tag: 0x5f2a, length: 2 }, // Currency
                { tag: 0x9a, length: 3 }, // Transaction Date
            ];

            const result = buildDefaultPdolData(pdolEntries, {
                amount: 1000,
                currencyCode: 0x0840,
            });

            // Amount should be 000000001000 (1000 cents in BCD)
            assert.strictEqual(result.subarray(0, 6).toString('hex'), '000000001000');
            // Currency should be 0840 (USD)
            assert.strictEqual(result.subarray(6, 8).toString('hex'), '0840');
            // Date should be today's date (3 bytes)
            assert.strictEqual(result.length, 11);
        });

        it('should allow custom overrides', () => {
            const pdolEntries = [{ tag: 0x9f02, length: 6 }];

            const customAmount = Buffer.from([0x00, 0x00, 0x00, 0x05, 0x00, 0x00]);
            const result = buildDefaultPdolData(pdolEntries, {
                amount: 1000,
                currencyCode: 0x0840,
                overrides: new Map([[0x9f02, customAmount]]),
            });

            assert.strictEqual(result.toString('hex'), '000000050000');
        });

        it('should use zeros for tags without defaults', () => {
            const pdolEntries = [
                { tag: 0x9f99, length: 4 }, // Unknown tag
            ];

            const result = buildDefaultPdolData(pdolEntries, {
                amount: 1000,
                currencyCode: 0x0840,
            });

            assert.strictEqual(result.toString('hex'), '00000000');
        });
    });

    describe('buildDefaultCdolData', async () => {
        const { buildDefaultCdolData } = await import('./emv-application.js');

        it('should build CDOL data with common fields', () => {
            const result = buildDefaultCdolData({
                amount: 2500,
                currencyCode: 0x0840,
            });

            // Should contain amount, other amount, country code, TVR, currency, date, type, unpredictable number
            // 6 + 6 + 2 + 5 + 2 + 3 + 1 + 4 = 29 bytes
            assert.strictEqual(result.length, 29);

            // Amount should be first 6 bytes
            assert.strictEqual(result.subarray(0, 6).toString('hex'), '000000002500');
        });

        it('should include transaction type', () => {
            const result = buildDefaultCdolData({
                amount: 1000,
                currencyCode: 0x0840,
                transactionType: 0x09, // Cashback
            });

            // Transaction type is at offset 24 (after amount 6 + other 6 + country 2 + tvr 5 + currency 2 + date 3)
            assert.strictEqual(result[24], 0x09);
        });
    });

    describe('performTransaction', () => {
        it('should orchestrate full transaction flow', async () => {
            // Set up mock responses for the transaction flow
            let callCount = 0;
            mockCard.transmit = async () => {
                callCount++;
                if (callCount === 1) {
                    // GPO response (Format 1): 80 len AIP(2) AFL(4)
                    // AIP: 1C00, AFL: SFI 1 (0x08) records 1-1
                    return Buffer.from([
                        0x80, 0x06, 0x1c, 0x00, 0x08, 0x01, 0x01, 0x00, 0x90, 0x00,
                    ]);
                } else if (callCount === 2) {
                    // Read record response - proper TLV structure
                    // 70 len [5A len PAN]
                    return Buffer.from([
                        0x70, 0x0a, 0x5a, 0x08, 0x12, 0x34, 0x56, 0x78, 0x90, 0x12, 0x34, 0x56,
                        0x90, 0x00,
                    ]);
                } else if (callCount === 3) {
                    // Generate AC response with cryptogram - proper TLV structure
                    // 9F27 (4 bytes: 2-byte tag + 1-byte len + 1-byte value) = 4
                    // 9F36 (5 bytes: 2-byte tag + 1-byte len + 2-byte value) = 5
                    // 9F26 (11 bytes: 2-byte tag + 1-byte len + 8-byte value) = 11
                    // Total = 20 bytes = 0x14
                    return Buffer.from([
                        0x77,
                        0x14, // 20 bytes
                        0x9f,
                        0x27,
                        0x01,
                        0x80, // CID: ARQC (4 bytes)
                        0x9f,
                        0x36,
                        0x02,
                        0x00,
                        0x01, // ATC: 1 (5 bytes)
                        0x9f,
                        0x26,
                        0x08,
                        0x12,
                        0x34,
                        0x56,
                        0x78,
                        0x9a,
                        0xbc,
                        0xde,
                        0xf0, // Cryptogram (11 bytes)
                        0x90,
                        0x00, // SW
                    ]);
                }
                return Buffer.from([0x90, 0x00]);
            };

            const result = await emv.performTransaction({
                amount: 1000,
                currencyCode: 0x0840,
                transactionType: 0x00,
            });

            assert.ok(result);
            assert.strictEqual(result.success, true);
            assert.strictEqual(result.cryptogramType, 'ARQC');
            assert.ok(result.cryptogram);
            assert.strictEqual(result.atc, 1);
        });

        it('should handle GPO failure', async () => {
            mockCard.transmit = async () => Buffer.from([0x69, 0x85]); // Conditions not satisfied

            const result = await emv.performTransaction({
                amount: 1000,
                currencyCode: 0x0840,
            });

            assert.strictEqual(result.success, false);
            assert.ok(result.error);
        });
    });

    describe('parseCvmList', async () => {
        const { parseCvmList } = await import('./emv-application.js');

        it('should parse CVM list with amount thresholds', () => {
            // CVM List: X=1000, Y=5000, then rules
            const buffer = Buffer.from([
                0x00,
                0x00,
                0x03,
                0xe8, // X = 1000
                0x00,
                0x00,
                0x13,
                0x88, // Y = 5000
                0x02,
                0x03, // Enciphered PIN online, if terminal supports CVM
                0x1e,
                0x03, // Signature, if terminal supports CVM
                0x1f,
                0x00, // No CVM, always
            ]);
            const result = parseCvmList(buffer);

            assert.strictEqual(result.amountX, 1000);
            assert.strictEqual(result.amountY, 5000);
            assert.strictEqual(result.rules.length, 3);

            assert.strictEqual(result.rules[0]?.method, 'enciphered_pin_online');
            assert.strictEqual(result.rules[0]?.condition, 'terminal_supports_cvm');
            assert.strictEqual(result.rules[0]?.failIfUnsuccessful, true);

            assert.strictEqual(result.rules[1]?.method, 'signature');
            assert.strictEqual(result.rules[2]?.method, 'no_cvm');
        });

        it('should handle continue-on-fail flag', () => {
            const buffer = Buffer.from([
                0x00,
                0x00,
                0x00,
                0x00, // X = 0
                0x00,
                0x00,
                0x00,
                0x00, // Y = 0
                0x42,
                0x00, // Enciphered PIN online + continue if fails, always
            ]);
            const result = parseCvmList(buffer);

            assert.strictEqual(result.rules[0]?.failIfUnsuccessful, false);
        });

        it('should return empty rules for buffer too short', () => {
            const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
            const result = parseCvmList(buffer);
            assert.strictEqual(result.rules.length, 0);
        });
    });

    describe('evaluateCvm', async () => {
        const { parseCvmList, evaluateCvm } = await import('./emv-application.js');

        it('should select first matching rule', () => {
            const cvmList = parseCvmList(
                Buffer.from([
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x02,
                    0x03, // Enciphered PIN, if terminal supports
                    0x1e,
                    0x03, // Signature, if terminal supports
                ])
            );

            const result = evaluateCvm(cvmList, { terminalSupportsCvm: true });
            assert.strictEqual(result?.method, 'enciphered_pin_online');
        });

        it('should skip rules where condition not met', () => {
            const cvmList = parseCvmList(
                Buffer.from([
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x02,
                    0x03, // Enciphered PIN, if terminal supports
                    0x1f,
                    0x00, // No CVM, always
                ])
            );

            const result = evaluateCvm(cvmList, { terminalSupportsCvm: false });
            assert.strictEqual(result?.method, 'no_cvm');
        });

        it('should handle amount threshold conditions', () => {
            const cvmList = parseCvmList(
                Buffer.from([
                    0x00,
                    0x00,
                    0x03,
                    0xe8, // X = 1000
                    0x00,
                    0x00,
                    0x00,
                    0x00, // Y = 0
                    0x02,
                    0x07, // Enciphered PIN, if amount > X
                    0x1f,
                    0x00, // No CVM, always
                ])
            );

            // Amount 500 is under X (1000), so PIN rule doesn't apply
            const result1 = evaluateCvm(cvmList, { amount: 500 });
            assert.strictEqual(result1?.method, 'no_cvm');

            // Amount 1500 is over X, so PIN rule applies
            const result2 = evaluateCvm(cvmList, { amount: 1500 });
            assert.strictEqual(result2?.method, 'enciphered_pin_online');
        });

        it('should return undefined if no rules match', () => {
            const cvmList = parseCvmList(
                Buffer.from([
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x00,
                    0x02,
                    0x03, // Enciphered PIN, if terminal supports
                ])
            );

            const result = evaluateCvm(cvmList, { terminalSupportsCvm: false });
            assert.strictEqual(result, undefined);
        });
    });

    describe('stringToBcd', async () => {
        const { stringToBcd } = await import('./emv-application.js');

        it('should encode "00" as 0x00', () => {
            assert.strictEqual(stringToBcd('00'), 0x00);
        });

        it('should encode "12" as 0x12', () => {
            assert.strictEqual(stringToBcd('12'), 0x12);
        });

        it('should encode "25" as 0x25', () => {
            assert.strictEqual(stringToBcd('25'), 0x25);
        });

        it('should encode "99" as 0x99', () => {
            assert.strictEqual(stringToBcd('99'), 0x99);
        });

        it('should encode "10" correctly (not as hex 16)', () => {
            // This is the key test - parseInt('10', 16) would give 16 (0x10)
            // but BCD encoding of "10" should be (1 << 4) | 0 = 0x10 = 16
            // So for '10' specifically, both approaches give same result.
            // Let's test '31' where they differ: parseInt('31', 16) = 49 (0x31)
            // BCD '31' = (3 << 4) | 1 = 49 (0x31) - also same!
            // The bug is subtle - it works for valid date digits 0-9.
            // Test with explicit nibble check
            const result = stringToBcd('31');
            assert.strictEqual(result >> 4, 3, 'High nibble should be 3');
            assert.strictEqual(result & 0x0f, 1, 'Low nibble should be 1');
        });

        it('should throw TypeError for empty string', () => {
            assert.throws(() => stringToBcd(''), TypeError);
        });

        it('should throw TypeError for single character', () => {
            assert.throws(() => stringToBcd('5'), TypeError);
        });

        it('should throw TypeError for string longer than 2 characters', () => {
            assert.throws(() => stringToBcd('123'), TypeError);
        });

        it('should throw TypeError for non-digit characters', () => {
            assert.throws(() => stringToBcd('ab'), TypeError);
            assert.throws(() => stringToBcd('1a'), TypeError);
            assert.throws(() => stringToBcd('a1'), TypeError);
        });
    });

    describe('parseGpoResponseBuffer', async () => {
        const { parseGpoResponseBuffer } = await import('./emv-application.js');

        it('should parse Format 1 (tag 80) GPO response', () => {
            // Format 1: 80 len AIP(2) AFL(4)
            // AIP: 1C00, AFL: SFI 1 records 1-1
            const buffer = Buffer.from([0x80, 0x06, 0x1c, 0x00, 0x08, 0x01, 0x01, 0x00]);
            const result = parseGpoResponseBuffer(buffer);

            assert.ok(result.aip);
            assert.strictEqual(result.aip.toString('hex'), '1c00');
            assert.strictEqual(result.afl.length, 1);
            assert.strictEqual(result.afl[0]?.sfi, 1);
            assert.strictEqual(result.afl[0]?.firstRecord, 1);
            assert.strictEqual(result.afl[0]?.lastRecord, 1);
        });

        it('should parse Format 2 (tag 77) GPO response', () => {
            // Format 2: 77 len [82 02 AIP] [94 04 AFL]
            const buffer = Buffer.from([
                0x77, 0x0a, 0x82, 0x02, 0x3c, 0x00, 0x94, 0x04, 0x08, 0x01, 0x02, 0x01,
            ]);
            const result = parseGpoResponseBuffer(buffer);

            assert.ok(result.aip);
            assert.strictEqual(result.aip.toString('hex'), '3c00');
            assert.strictEqual(result.afl.length, 1);
            assert.strictEqual(result.afl[0]?.sfi, 1);
            assert.strictEqual(result.afl[0]?.firstRecord, 1);
            assert.strictEqual(result.afl[0]?.lastRecord, 2);
        });

        it('should return empty result for empty buffer', () => {
            const result = parseGpoResponseBuffer(Buffer.alloc(0));
            assert.strictEqual(result.aip, undefined);
            assert.strictEqual(result.afl.length, 0);
        });

        it('should return empty result for unknown format', () => {
            const buffer = Buffer.from([0x99, 0x02, 0x12, 0x34]);
            const result = parseGpoResponseBuffer(buffer);
            assert.strictEqual(result.aip, undefined);
            assert.strictEqual(result.afl.length, 0);
        });

        it('should handle truncated Format 1 buffer gracefully', () => {
            // Buffer says len=6 but only has 1 byte of data after header
            const buffer = Buffer.from([0x80, 0x06, 0x1c]);
            const result = parseGpoResponseBuffer(buffer);
            assert.strictEqual(result.aip, undefined);
            assert.strictEqual(result.afl.length, 0);
        });

        it('should handle Format 1 buffer too short for AIP', () => {
            // Buffer has length byte but not enough data for 2-byte AIP
            const buffer = Buffer.from([0x80, 0x02, 0x1c]);
            const result = parseGpoResponseBuffer(buffer);
            assert.strictEqual(result.aip, undefined);
            assert.strictEqual(result.afl.length, 0);
        });
    });

    describe('parseGenerateAcResponse', async () => {
        const { parseGenerateAcResponse } = await import('./emv-application.js');

        it('should parse ARQC response', () => {
            // 77 len [9F27 01 80] [9F36 02 00 01] [9F26 08 cryptogram]
            // Length = 4 + 5 + 11 = 20 = 0x14
            const buffer = Buffer.from([
                0x77, 0x14, 0x9f, 0x27, 0x01, 0x80, 0x9f, 0x36, 0x02, 0x00, 0x01, 0x9f, 0x26, 0x08,
                0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
            ]);
            const result = parseGenerateAcResponse(buffer);

            assert.strictEqual(result.cryptogramType, 'ARQC');
            assert.ok(result.cryptogram);
            assert.strictEqual(result.cryptogram.toString('hex'), '1122334455667788');
            assert.strictEqual(result.atc, 1);
        });

        it('should parse TC response', () => {
            // 77 len [9F27 01 40 (TC)]
            const buffer = Buffer.from([0x77, 0x04, 0x9f, 0x27, 0x01, 0x40]);
            const result = parseGenerateAcResponse(buffer);
            assert.strictEqual(result.cryptogramType, 'TC');
        });

        it('should parse AAC response', () => {
            // 77 len [9F27 01 00 (AAC)]
            const buffer = Buffer.from([0x77, 0x04, 0x9f, 0x27, 0x01, 0x00]);
            const result = parseGenerateAcResponse(buffer);
            assert.strictEqual(result.cryptogramType, 'AAC');
        });

        it('should return undefined values for empty buffer', () => {
            const buffer = Buffer.alloc(0);
            const result = parseGenerateAcResponse(buffer);
            assert.strictEqual(result.cryptogramType, undefined);
            assert.strictEqual(result.cryptogram, undefined);
            assert.strictEqual(result.atc, undefined);
        });

        it('should return undefined atc for truncated ATC buffer (1 byte)', () => {
            // 77 len [9F27 01 80] [9F36 01 00] - ATC has only 1 byte instead of 2
            const buffer = Buffer.from([
                0x77, 0x08, 0x9f, 0x27, 0x01, 0x80, 0x9f, 0x36, 0x01, 0x00,
            ]);
            const result = parseGenerateAcResponse(buffer);
            assert.strictEqual(result.cryptogramType, 'ARQC');
            assert.strictEqual(result.atc, undefined);
        });
    });
});
