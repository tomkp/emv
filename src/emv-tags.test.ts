import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EMV_TAGS, format, findTag, findTagInBuffer, getTagName } from './index.js';
import type { CardResponse } from './types.js';

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
        assert.strictEqual(EMV_TAGS['4F'], 'APP_IDENTIFIER');
        assert.strictEqual(EMV_TAGS['5A'], 'PAN');
        assert.strictEqual(EMV_TAGS['5F20'], 'CARDHOLDER_NAME');
    });

    it('should include all standard EMV tags', () => {
        const requiredTags = ['4F', '50', '5A', '5F20', '5F24', '9F26'] as const;
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

describe('findTagInBuffer', () => {
    it('should find a tag in a Buffer', () => {
        const buffer = Buffer.from([0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10]);
        const result = findTagInBuffer(buffer, 0x4f);
        assert.ok(Buffer.isBuffer(result));
        assert.strictEqual(result?.toString('hex'), 'a0000000041010');
    });

    it('should return undefined for non-existent tags', () => {
        const buffer = Buffer.from([0x50, 0x04, 0x56, 0x49, 0x53, 0x41]);
        const result = findTagInBuffer(buffer, 0x9999);
        assert.strictEqual(result, undefined);
    });

    it('should find tag in nested TLV structure', () => {
        const buffer = Buffer.from([
            0x6f, 0x0c, 0x84, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10, 0x88, 0x01, 0x01,
        ]);
        const result = findTagInBuffer(buffer, 0x88);
        assert.strictEqual(result?.toString('hex'), '01');
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

    it('should return empty string for empty buffer', () => {
        const response = createMockResponse(Buffer.from([]));
        const result = format(response);
        assert.strictEqual(result, '');
    });

    it('should handle malformed TLV gracefully', () => {
        // Truncated TLV - tag says 4 bytes but only 2 provided
        const response = createMockResponse(Buffer.from([0x50, 0x04, 0x56, 0x49]));
        // Should not throw, behavior depends on ber-tlv library
        assert.doesNotThrow(() => format(response));
    });

    it('should format Track 2 data with decoded fields', () => {
        // Tag 57 (Track 2): PAN 4659414873268675, Sep D, Exp 2108, Svc 201
        const response = createMockResponse(
            Buffer.from([0x57, 0x13, 0x46, 0x59, 0x41, 0x48, 0x73, 0x26, 0x86, 0x75, 0xd2, 0x10, 0x82, 0x01, 0x39, 0x90, 0x00, 0x00, 0x00, 0x00, 0x1f])
        );
        const result = format(response);
        // Should show raw hex
        assert.ok(result.includes('4659414873268675D2108201'), 'Should contain raw hex');
        // Should show decoded PAN with spaces
        assert.ok(result.includes('4659 4148 7326 8675'), 'Should contain formatted PAN');
        // Should show decoded expiry
        assert.ok(result.includes('2021-08'), 'Should contain formatted expiry');
    });

    it('should format PAN with spaces and show raw hex', () => {
        // Tag 5A (PAN): 4659414873268675
        const response = createMockResponse(
            Buffer.from([0x5a, 0x08, 0x46, 0x59, 0x41, 0x48, 0x73, 0x26, 0x86, 0x75])
        );
        const result = format(response);
        // Should show raw hex
        assert.ok(result.includes('4659414873268675'), 'Should contain raw hex');
        // Should show formatted PAN with spaces
        assert.ok(result.includes('4659 4148 7326 8675'), 'Should contain formatted PAN');
    });

    it('should format expiry date with raw hex and decoded date', () => {
        // Tag 5F24 (APP_EXPIRY): 210831 = 2021-08-31
        const response = createMockResponse(
            Buffer.from([0x5f, 0x24, 0x03, 0x21, 0x08, 0x31])
        );
        const result = format(response);
        // Should show raw hex
        assert.ok(result.includes('210831'), 'Should contain raw hex');
        // Should show decoded date
        assert.ok(result.includes('2021-08-31'), 'Should contain formatted date');
    });

    it('should format service code with meaning', () => {
        // Tag 5F30 (SERVICE_CODE): 0201
        const response = createMockResponse(
            Buffer.from([0x5f, 0x30, 0x02, 0x02, 0x01])
        );
        const result = format(response);
        // Should show raw hex
        assert.ok(result.includes('0201'), 'Should contain raw hex');
        // Should show decoded meaning
        assert.ok(result.includes('No restrictions'), 'Should contain service code meaning');
    });

    it('should format CVM list with rules', () => {
        // Tag 8E (CVM_LIST): amounts X=0, Y=0, then rules 4103 (0x41 = 0x40 continue flag + 0x01 Plaintext PIN, 0x03 = if terminal supports)
        const response = createMockResponse(
            Buffer.from([0x8e, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x41, 0x03])
        );
        const result = format(response);
        // Should show raw hex
        assert.ok(result.includes('00000000000000004103'), 'Should contain raw hex');
        // Should show rule hex
        assert.ok(result.includes('4103'), 'Should contain rule hex');
        // Should show decoded CVM (0x01 = Plaintext PIN by ICC)
        assert.ok(result.includes('Plaintext PIN by ICC'), 'Should contain CVM name');
    });

    it('should format AUC flags with meaning', () => {
        // Tag 9F07 (APP_USAGE_CONTROL): FF80 = all domestic/international cash/goods/services + ATMs + terminals + domestic cashback
        const response = createMockResponse(
            Buffer.from([0x9f, 0x07, 0x02, 0xff, 0x80])
        );
        const result = format(response);
        // Should show raw hex
        assert.ok(result.includes('FF80'), 'Should contain raw hex');
        // Should show some decoded flags
        assert.ok(result.includes('Domestic cash'), 'Should contain AUC flag');
    });

    it('should format IAC flags with meaning on separate lines', () => {
        // Tag 9F0D (IAC_DEFAULT): B800FC0000
        const response = createMockResponse(
            Buffer.from([0x9f, 0x0d, 0x05, 0xb8, 0x00, 0xfc, 0x00, 0x00])
        );
        const result = format(response);
        // Should show raw hex
        assert.ok(result.includes('B800FC0000'), 'Should contain raw hex');
        // Should show decoded flags on separate lines
        assert.ok(result.includes('Offline data auth not performed'), 'Should contain IAC flag');
        assert.ok(result.includes('CVM not successful'), 'Should contain CVM flag');
        // Flags should be on separate lines (contain newline before a flag)
        assert.ok(result.includes('\n'), 'Should have newlines for multi-line display');
    });

    it('should truncate binary data for certificates', () => {
        // Tag 90 (ISSUER_PK_CERTIFICATE): long binary data
        const certData = Buffer.alloc(128, 0xab);
        const tlv = Buffer.concat([Buffer.from([0x90, 0x81, 0x80]), certData]);
        const response = createMockResponse(tlv);
        const result = format(response);
        // Should show truncated hex
        assert.ok(result.includes('...'), 'Should be truncated');
        assert.ok(result.includes('128 bytes'), 'Should show byte count');
        // Should NOT show garbage ASCII in [brackets] format (but ANSI codes with [ are ok)
        assert.ok(!result.includes('[AB'), 'Should not show ASCII in brackets');
    });

    it('should format Track 1 Discretionary Data with decoded ASCII on new line', () => {
        // Tag 9F1F (TRACK_1_DD): ASCII-encoded discretionary data "205400932000000"
        const response = createMockResponse(
            Buffer.from([0x9f, 0x1f, 0x0f, 0x32, 0x30, 0x35, 0x34, 0x30, 0x30, 0x39, 0x33, 0x32, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30])
        );
        const result = format(response);
        // Should show raw hex
        assert.ok(result.includes('323035343030393332303030303030'), 'Should contain raw hex');
        // Should show decoded ASCII value on new line (not in brackets)
        assert.ok(result.includes('205400932000000'), 'Should contain decoded ASCII');
        // Should NOT use bracket format
        assert.ok(!result.includes('[205400932000000]'), 'Should not show ASCII in brackets');
    });

    it('should use color coding for identifier tags', () => {
        // Tag 5A (PAN) should use identifier color (cyan)
        const response = createMockResponse(
            Buffer.from([0x5a, 0x08, 0x46, 0x59, 0x41, 0x48, 0x73, 0x26, 0x86, 0x75])
        );
        const result = format(response);
        // Should contain cyan ANSI code for identifier
        assert.ok(result.includes('\x1b[36m'), 'Should use cyan color for identifier tags');
    });

    it('should use color coding for date tags', () => {
        // Tag 5F24 (APP_EXPIRY) should use date color (yellow)
        const response = createMockResponse(
            Buffer.from([0x5f, 0x24, 0x03, 0x21, 0x08, 0x31])
        );
        const result = format(response);
        // Should contain yellow ANSI code for dates
        assert.ok(result.includes('\x1b[33m'), 'Should use yellow color for date tags');
    });

    it('should use color coding for cryptographic tags', () => {
        // Tag 9F26 (APPLICATION_CRYPTOGRAM) should use crypto color (magenta)
        const response = createMockResponse(
            Buffer.from([0x9f, 0x26, 0x08, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])
        );
        const result = format(response);
        // Should contain magenta ANSI code for crypto
        assert.ok(result.includes('\x1b[35m'), 'Should use magenta color for crypto tags');
    });

    it('should use color coding for verification tags', () => {
        // Tag 8E (CVM_LIST) should use verification color (green)
        const response = createMockResponse(
            Buffer.from([0x8e, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x41, 0x03])
        );
        const result = format(response);
        // Should contain green ANSI code for verification
        assert.ok(result.includes('\x1b[32m'), 'Should use green color for verification tags');
    });
});
