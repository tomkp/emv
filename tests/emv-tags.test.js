import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EMV_TAGS, format, findTag, getTagName } from '../dist/index.js';

/**
 * @param {Buffer} buffer
 * @returns {{ buffer: Buffer, isOk: () => boolean, sw1: number, sw2: number }}
 */
function createMockResponse(buffer) {
    return {
        buffer,
        isOk: () => true,
        sw1: 0x90,
        sw2: 0x00,
    };
}

describe('EMV_TAGS', () => {
    it('should have correct tag definitions', () => {
        assert.strictEqual(EMV_TAGS['4F'], 'APP_IDENTIFIER');
        assert.strictEqual(EMV_TAGS['5A'], 'PAN');
        assert.strictEqual(EMV_TAGS['5F20'], 'CARDHOLDER_NAME');
    });

    it('should include all standard EMV tags', () => {
        const requiredTags = ['4F', '50', '5A', '5F20', '5F24', '9F26'];
        for (const tag of requiredTags) {
            assert.ok(tag in EMV_TAGS, `Missing tag ${tag}`);
        }
    });

    it('should have fixed typos from original implementation', () => {
        assert.strictEqual(EMV_TAGS['6F'], 'FILE_CONTROL_INFO');
        assert.strictEqual(EMV_TAGS['9B'], 'TRANSACTION_STATUS_INFORMATION');
        assert.strictEqual(EMV_TAGS['9F27'], 'CRYPTOGRAM_INFORMATION_DATA');
        assert.strictEqual(EMV_TAGS['9F37'], 'APP_UNPREDICTABLE_NUMBER');
    });
});

describe('getTagName', () => {
    it('should return tag name for known tags', () => {
        assert.strictEqual(getTagName(0x4f), 'APP_IDENTIFIER');
        assert.strictEqual(getTagName(0x50), 'APP_LABEL');
    });

    it('should return UNKNOWN_XX for unknown tags', () => {
        assert.strictEqual(getTagName(0xff), 'UNKNOWN_FF');
    });

    it('should handle two-byte tags', () => {
        assert.strictEqual(getTagName(0x5f20), 'CARDHOLDER_NAME');
        assert.strictEqual(getTagName(0x9f26), 'APPLICATION_CRYPTOGRAM');
    });
});

describe('findTag', () => {
    it('should find a tag in a simple TLV structure', () => {
        const response = createMockResponse(
            Buffer.from([0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10])
        );
        const result = findTag(response, 0x4f);
        assert.ok(Buffer.isBuffer(result));
        assert.strictEqual(result?.toString('hex'), 'a0000000041010');
    });

    it('should return undefined for non-existent tags', () => {
        const response = createMockResponse(Buffer.from([0x50, 0x04, 0x56, 0x49, 0x53, 0x41]));
        const result = findTag(response, 0x9999);
        assert.strictEqual(result, undefined);
    });

    it('should find tag in nested TLV structure', () => {
        const response = createMockResponse(
            Buffer.from([
                0x6f, 0x0c, 0x84, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10, 0x88, 0x01, 0x01,
            ])
        );
        const result = findTag(response, 0x84);
        assert.strictEqual(result?.toString('hex'), 'a0000000041010');
    });
});

describe('format', () => {
    it('should format TLV data as readable string', () => {
        const response = createMockResponse(Buffer.from([0x50, 0x04, 0x56, 0x49, 0x53, 0x41]));
        const result = format(response);
        assert.ok(result.includes('50'));
        assert.ok(result.includes('APP_LABEL'));
        assert.ok(result.includes('VISA'));
    });

    it('should show hex and ASCII representation', () => {
        const response = createMockResponse(Buffer.from([0x50, 0x04, 0x56, 0x49, 0x53, 0x41]));
        const result = format(response);
        assert.ok(result.includes('56495341'));
        assert.ok(result.includes('VISA'));
    });
});
