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
            mockCard.transmit = async () => Buffer.from([
                0x77, 0x12, 0x9f, 0x27, 0x01, 0x80, 0x9f, 0x36,
                0x02, 0x00, 0x01, 0x9f, 0x26, 0x08, 0x12, 0x34,
                0x56, 0x78, 0x9a, 0xbc, 0x90, 0x00
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
            mockCard.transmit = async () => Buffer.from([
                0x80, 0x08, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x90, 0x00
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
        describe('SW1=61 (GET RESPONSE required)', () => {
            it('should automatically send GET RESPONSE when SW1=61', async () => {
                let callCount = 0;
                mockCard.transmit = async (apdu) => {
                    const buf = Buffer.isBuffer(apdu) ? apdu : Buffer.from(apdu);
                    transmitCalls.push(buf);
                    callCount++;
                    if (callCount === 1) {
                        // First call: return 61 1C (more data available, 28 bytes)
                        return Buffer.from([0x61, 0x1c]);
                    } else {
                        // Second call (GET RESPONSE): return actual data
                        return Buffer.from([
                            0x6f, 0x1a, 0x84, 0x0e, 0x31, 0x50, 0x41, 0x59,
                            0x2e, 0x53, 0x59, 0x53, 0x2e, 0x44, 0x44, 0x46,
                            0x30, 0x31, 0xa5, 0x08, 0x88, 0x01, 0x01, 0x5f,
                            0x2d, 0x02, 0x65, 0x6e, 0x90, 0x00
                        ]);
                    }
                };

                const response = await emv.selectPse();

                // Should have made 2 transmit calls
                assert.strictEqual(transmitCalls.length, 2);

                // Second call should be GET RESPONSE (00 C0 00 00 1C)
                const getResponseApdu = transmitCalls[1];
                assert.ok(getResponseApdu);
                assert.strictEqual(getResponseApdu[0], 0x00); // CLA
                assert.strictEqual(getResponseApdu[1], 0xc0); // INS: GET RESPONSE
                assert.strictEqual(getResponseApdu[2], 0x00); // P1
                assert.strictEqual(getResponseApdu[3], 0x00); // P2
                assert.strictEqual(getResponseApdu[4], 0x1c); // Le = 28 bytes

                // Response should be successful with data
                assert.strictEqual(response.isOk(), true);
                assert.strictEqual(response.sw1, 0x90);
                assert.strictEqual(response.sw2, 0x00);
                assert.ok(response.buffer.length > 0);
            });

            it('should handle chained GET RESPONSE (multiple 61 XX)', async () => {
                let callCount = 0;
                mockCard.transmit = async () => {
                    callCount++;
                    if (callCount === 1) {
                        // First response: data + 61 10
                        return Buffer.from([0x6f, 0x0a, 0x84, 0x08, 0x61, 0x10]);
                    } else if (callCount === 2) {
                        // Second response: more data + 61 08
                        return Buffer.from([0x01, 0x02, 0x03, 0x04, 0x61, 0x08]);
                    } else {
                        // Final response: remaining data + 90 00
                        return Buffer.from([0x05, 0x06, 0x07, 0x08, 0x90, 0x00]);
                    }
                };

                const response = await emv.selectPse();
                assert.strictEqual(response.isOk(), true);
                // Should combine all data parts
                assert.strictEqual(response.buffer.toString('hex'), '6f0a84080102030405060708');
            });
        });

        describe('SW1=6C (wrong Le, retry with correct length)', () => {
            it('should retry command with correct Le when SW1=6C', async () => {
                let callCount = 0;
                mockCard.transmit = async (apdu) => {
                    const buf = Buffer.isBuffer(apdu) ? apdu : Buffer.from(apdu);
                    transmitCalls.push(buf);
                    callCount++;
                    if (callCount === 1) {
                        // First call: return 6C 59 (wrong Le, expected 89 bytes)
                        return Buffer.from([0x6c, 0x59]);
                    } else {
                        // Second call with correct Le: return data
                        return Buffer.from([
                            0x70, 0x57, 0x61, 0x25, 0x4f, 0x07, 0xa0, 0x00,
                            0x00, 0x00, 0x03, 0x10, 0x10, 0x50, 0x0a, 0x56,
                            0x69, 0x73, 0x61, 0x20, 0x44, 0x65, 0x62, 0x69,
                            0x74, 0x90, 0x00
                        ]);
                    }
                };

                const response = await emv.readRecord(1, 1);

                // Should have made 2 transmit calls
                assert.strictEqual(transmitCalls.length, 2);

                // Second call should have Le = 0x59
                const retryApdu = transmitCalls[1];
                assert.ok(retryApdu);
                assert.strictEqual(retryApdu[retryApdu.length - 1], 0x59);

                // Response should be successful
                assert.strictEqual(response.isOk(), true);
                assert.ok(response.buffer.length > 0);
            });
        });

        describe('combined SW1=6C and SW1=61 handling', () => {
            it('should handle 6C followed by 61', async () => {
                let callCount = 0;
                mockCard.transmit = async (apdu) => {
                    const buf = Buffer.isBuffer(apdu) ? apdu : Buffer.from(apdu);
                    transmitCalls.push(buf);
                    callCount++;
                    if (callCount === 1) {
                        // First: wrong Le
                        return Buffer.from([0x6c, 0x20]);
                    } else if (callCount === 2) {
                        // Second: more data available
                        return Buffer.from([0x61, 0x10]);
                    } else {
                        // Third: actual data
                        return Buffer.from([0x6f, 0x0e, 0x84, 0x0c, 0x01, 0x02, 0x90, 0x00]);
                    }
                };

                const response = await emv.selectPse();
                assert.strictEqual(transmitCalls.length, 3);
                assert.strictEqual(response.isOk(), true);
            });
        });
    });
});
