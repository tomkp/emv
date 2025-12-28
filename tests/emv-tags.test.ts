import { describe, it, expect } from 'vitest';
import { EMV_TAGS, format, findTag, getTagName } from '../src/emv-tags.js';
import type { CardResponse } from '../src/types.js';

function createMockResponse(buffer: Buffer): CardResponse {
    return {
        buffer,
        isOk: () => true,
        sw1: 0x90,
        sw2: 0x00,
    };
}

describe('EMV_TAGS', () => {
    it('should have correct tag definitions', () => {
        expect(EMV_TAGS['4F']).toBe('APP_IDENTIFIER');
        expect(EMV_TAGS['5A']).toBe('PAN');
        expect(EMV_TAGS['5F20']).toBe('CARDHOLDER_NAME');
    });

    it('should include all standard EMV tags', () => {
        const requiredTags = ['4F', '50', '5A', '5F20', '5F24', '9F26'];
        for (const tag of requiredTags) {
            expect(EMV_TAGS).toHaveProperty(tag);
        }
    });

    it('should have fixed typos from original implementation', () => {
        expect(EMV_TAGS['6F']).toBe('FILE_CONTROL_INFO');
        expect(EMV_TAGS['9B']).toBe('TRANSACTION_STATUS_INFORMATION');
        expect(EMV_TAGS['9F27']).toBe('CRYPTOGRAM_INFORMATION_DATA');
        expect(EMV_TAGS['9F37']).toBe('APP_UNPREDICTABLE_NUMBER');
    });
});

describe('getTagName', () => {
    it('should return tag name for known tags', () => {
        expect(getTagName(0x4f)).toBe('APP_IDENTIFIER');
        expect(getTagName(0x50)).toBe('APP_LABEL');
    });

    it('should return UNKNOWN_XX for unknown tags', () => {
        expect(getTagName(0xff)).toBe('UNKNOWN_FF');
    });

    it('should handle two-byte tags', () => {
        expect(getTagName(0x5f20)).toBe('CARDHOLDER_NAME');
        expect(getTagName(0x9f26)).toBe('APPLICATION_CRYPTOGRAM');
    });
});

describe('findTag', () => {
    it('should find a tag in a simple TLV structure', () => {
        // Tag 4F (APP_IDENTIFIER) with 7 bytes of data
        const response = createMockResponse(
            Buffer.from([0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10])
        );
        const result = findTag(response, 0x4f);
        expect(result).toBeInstanceOf(Buffer);
        expect(result?.toString('hex')).toBe('a0000000041010');
    });

    it('should return undefined for non-existent tags', () => {
        // Tag 50 (APP_LABEL) with "VISA"
        const response = createMockResponse(Buffer.from([0x50, 0x04, 0x56, 0x49, 0x53, 0x41]));
        const result = findTag(response, 0x9999);
        expect(result).toBeUndefined();
    });

    it('should find tag in nested TLV structure', () => {
        // Constructed tag 6F containing tag 84 with AID
        const response = createMockResponse(
            Buffer.from([
                0x6f, 0x0b, // FCI Template, length 11
                0x84, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10, // DF Name (AID)
                0x88, 0x01, 0x01, // SFI
            ])
        );
        const result = findTag(response, 0x84);
        expect(result?.toString('hex')).toBe('a0000000041010');
    });
});

describe('format', () => {
    it('should format TLV data as readable string', () => {
        // Tag 50 (APP_LABEL) with "VISA"
        const response = createMockResponse(Buffer.from([0x50, 0x04, 0x56, 0x49, 0x53, 0x41]));
        const result = format(response);
        expect(result).toContain('50');
        expect(result).toContain('APP_LABEL');
        expect(result).toContain('VISA');
    });

    it('should format nested structures with indentation', () => {
        const response = createMockResponse(
            Buffer.from([
                0x6f, 0x07, // FCI Template
                0x84, 0x05, 0xa0, 0x00, 0x00, 0x00, 0x04, // DF Name
            ])
        );
        const result = format(response);
        expect(result).toContain('6F');
        expect(result).toContain('FILE_CONTROL_INFO');
    });

    it('should show hex and ASCII representation', () => {
        const response = createMockResponse(Buffer.from([0x50, 0x04, 0x56, 0x49, 0x53, 0x41]));
        const result = format(response);
        expect(result).toContain('56495341'); // hex
        expect(result).toContain('VISA'); // ascii
    });
});
