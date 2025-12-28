import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CardReader } from '../src/types.js';

// Mock iso7816 before importing EmvApplication
vi.mock('iso7816', () => ({
    default: vi.fn(() => ({
        selectFile: vi.fn().mockResolvedValue({
            buffer: Buffer.from([0x6f, 0x00]),
            isOk: () => true,
            sw1: 0x90,
            sw2: 0x00,
        }),
        readRecord: vi.fn().mockResolvedValue({
            buffer: Buffer.from([]),
            isOk: () => false,
            sw1: 0x6a,
            sw2: 0x83,
        }),
    })),
}));

import { EmvApplication } from '../src/emv-application.js';

describe('EmvApplication', () => {
    let emv: EmvApplication;
    let mockDevices: unknown;
    let mockReader: CardReader;

    beforeEach(() => {
        mockDevices = {};
        mockReader = { name: 'Test Reader' };
        emv = new EmvApplication(mockDevices, mockReader);
    });

    describe('constructor', () => {
        it('should create an instance', () => {
            expect(emv).toBeInstanceOf(EmvApplication);
        });
    });

    describe('selectPse', () => {
        it('should call selectFile with PSE identifier', async () => {
            const response = await emv.selectPse();
            expect(response).toBeDefined();
            expect(response.isOk()).toBe(true);
        });
    });

    describe('selectApplication', () => {
        it('should throw RangeError for AID shorter than 5 bytes', () => {
            expect(() => emv.selectApplication([0xa0, 0x00, 0x00, 0x00])).toThrow(
                /AID must be between 5 and 16 bytes/
            );
        });

        it('should throw RangeError for AID longer than 16 bytes', () => {
            const longAid = new Array(17).fill(0xa0);
            expect(() => emv.selectApplication(longAid)).toThrow(
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
    });

    describe('readRecord', () => {
        it('should throw RangeError for SFI less than 1', () => {
            expect(() => emv.readRecord(0, 1)).toThrow(
                /SFI must be an integer between 1 and 30/
            );
        });

        it('should throw RangeError for SFI greater than 30', () => {
            expect(() => emv.readRecord(31, 1)).toThrow(
                /SFI must be an integer between 1 and 30/
            );
        });

        it('should throw RangeError for negative record number', () => {
            expect(() => emv.readRecord(1, -1)).toThrow(
                /Record number must be an integer between 0 and 255/
            );
        });

        it('should throw RangeError for record number greater than 255', () => {
            expect(() => emv.readRecord(1, 256)).toThrow(
                /Record number must be an integer between 0 and 255/
            );
        });

        it('should throw RangeError for non-integer SFI', () => {
            expect(() => emv.readRecord(1.5, 1)).toThrow(
                /SFI must be an integer between 1 and 30/
            );
        });

        it('should throw RangeError for non-integer record', () => {
            expect(() => emv.readRecord(1, 1.5)).toThrow(
                /Record number must be an integer between 0 and 255/
            );
        });

        it('should accept valid SFI and record values', async () => {
            await expect(emv.readRecord(1, 0)).resolves.toBeDefined();
            await expect(emv.readRecord(30, 255)).resolves.toBeDefined();
        });
    });
});
