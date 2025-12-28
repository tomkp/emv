import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SmartCard, Reader } from '../src/types.js';
import { EmvApplication } from '../src/emv-application.js';

describe('EmvApplication', () => {
    let emv: EmvApplication;
    let mockReader: Reader;
    let mockCard: SmartCard;
    let transmitMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        // Response with SW1=90 SW2=00 (success)
        transmitMock = vi.fn().mockResolvedValue(Buffer.from([0x6f, 0x00, 0x90, 0x00]));
        mockReader = { name: 'Test Reader' };
        mockCard = {
            atr: Buffer.from([0x3b, 0x8f, 0x80, 0x01]),
            transmit: transmitMock,
        };
        emv = new EmvApplication(mockReader, mockCard);
    });

    describe('constructor', () => {
        it('should create an instance', () => {
            expect(emv).toBeInstanceOf(EmvApplication);
        });
    });

    describe('getAtr', () => {
        it('should return ATR as hex string', () => {
            expect(emv.getAtr()).toBe('3b8f8001');
        });
    });

    describe('getReaderName', () => {
        it('should return reader name', () => {
            expect(emv.getReaderName()).toBe('Test Reader');
        });
    });

    describe('selectPse', () => {
        it('should transmit SELECT APDU for PSE', async () => {
            const response = await emv.selectPse();
            expect(response).toBeDefined();
            expect(response.isOk()).toBe(true);
            expect(transmitMock).toHaveBeenCalledTimes(1);

            // Verify APDU structure
            const apdu = transmitMock.mock.calls[0]?.[0] as Buffer;
            expect(apdu[0]).toBe(0x00); // CLA
            expect(apdu[1]).toBe(0xa4); // INS: SELECT
            expect(apdu[2]).toBe(0x04); // P1
            expect(apdu[3]).toBe(0x00); // P2
        });

        it('should parse response correctly', async () => {
            transmitMock.mockResolvedValue(Buffer.from([0x6f, 0x0a, 0x84, 0x07, 0x90, 0x00]));
            const response = await emv.selectPse();
            expect(response.sw1).toBe(0x90);
            expect(response.sw2).toBe(0x00);
            expect(response.buffer.toString('hex')).toBe('6f0a8407');
        });
    });

    describe('selectApplication', () => {
        it('should throw RangeError for AID shorter than 5 bytes', async () => {
            await expect(emv.selectApplication([0xa0, 0x00, 0x00, 0x00])).rejects.toThrow(
                /AID must be between 5 and 16 bytes/
            );
        });

        it('should throw RangeError for AID longer than 16 bytes', async () => {
            const longAid = new Array(17).fill(0xa0);
            await expect(emv.selectApplication(longAid)).rejects.toThrow(
                /AID must be between 5 and 16 bytes/
            );
        });

        it('should accept valid AID as array', async () => {
            const aid = [0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10];
            await expect(emv.selectApplication(aid)).resolves.toBeDefined();
        });

        it('should accept valid AID as Buffer', async () => {
            const aid = Buffer.from([0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10]);
            await expect(emv.selectApplication(aid)).resolves.toBeDefined();
        });

        it('should accept minimum length AID (5 bytes)', async () => {
            const aid = [0xa0, 0x00, 0x00, 0x00, 0x04];
            await expect(emv.selectApplication(aid)).resolves.toBeDefined();
        });

        it('should accept maximum length AID (16 bytes)', async () => {
            const aid = new Array(16).fill(0xa0);
            await expect(emv.selectApplication(aid)).resolves.toBeDefined();
        });

        it('should include AID in APDU', async () => {
            const aid = [0xa0, 0x00, 0x00, 0x00, 0x04];
            await emv.selectApplication(aid);
            const apdu = transmitMock.mock.calls[0]?.[0] as Buffer;
            expect(apdu[4]).toBe(5); // Lc = length of AID
            expect(apdu.subarray(5, 10).toString('hex')).toBe('a000000004');
        });
    });

    describe('readRecord', () => {
        it('should throw RangeError for SFI less than 1', async () => {
            await expect(emv.readRecord(0, 1)).rejects.toThrow(
                /SFI must be an integer between 1 and 30/
            );
        });

        it('should throw RangeError for SFI greater than 30', async () => {
            await expect(emv.readRecord(31, 1)).rejects.toThrow(
                /SFI must be an integer between 1 and 30/
            );
        });

        it('should throw RangeError for negative record number', async () => {
            await expect(emv.readRecord(1, -1)).rejects.toThrow(
                /Record number must be an integer between 0 and 255/
            );
        });

        it('should throw RangeError for record number greater than 255', async () => {
            await expect(emv.readRecord(1, 256)).rejects.toThrow(
                /Record number must be an integer between 0 and 255/
            );
        });

        it('should throw RangeError for non-integer SFI', async () => {
            await expect(emv.readRecord(1.5, 1)).rejects.toThrow(
                /SFI must be an integer between 1 and 30/
            );
        });

        it('should throw RangeError for non-integer record', async () => {
            await expect(emv.readRecord(1, 1.5)).rejects.toThrow(
                /Record number must be an integer between 0 and 255/
            );
        });

        it('should accept valid SFI and record values', async () => {
            await expect(emv.readRecord(1, 1)).resolves.toBeDefined();
            await expect(emv.readRecord(30, 255)).resolves.toBeDefined();
        });

        it('should encode SFI correctly in P2', async () => {
            // Error response for non-existent record
            transmitMock.mockResolvedValue(Buffer.from([0x6a, 0x83]));
            await emv.readRecord(1, 1);
            const apdu = transmitMock.mock.calls[0]?.[0] as Buffer;
            expect(apdu[0]).toBe(0x00); // CLA
            expect(apdu[1]).toBe(0xb2); // INS: READ RECORD
            expect(apdu[2]).toBe(1); // P1: record number
            expect(apdu[3]).toBe((1 << 3) | 0x04); // P2: SFI=1 in upper 5 bits, 0x04
        });

        it('should return non-OK response for error status words', async () => {
            transmitMock.mockResolvedValue(Buffer.from([0x6a, 0x83])); // Record not found
            const response = await emv.readRecord(1, 1);
            expect(response.isOk()).toBe(false);
            expect(response.sw1).toBe(0x6a);
            expect(response.sw2).toBe(0x83);
        });
    });
});
