import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the source directory (tests run from dist/, source is in src/)
const srcDir = __dirname.replace(/\/dist$/, '/src');

describe('Interactive CLI', () => {
    describe('module exports', () => {
        it('should export runInteractive function', async () => {
            const module = await import('./interactive.js');
            assert.strictEqual(typeof module.runInteractive, 'function');
        });
    });

    describe('PinScreen component', () => {
        it('should not render both manual maskedPin and TextInput with mask prop (causes double asterisks)', () => {
            // Read the source file to check for the bug pattern
            const sourceFile = join(srcDir, 'interactive.tsx');
            const source = readFileSync(sourceFile, 'utf-8');

            // Find the PinScreen function body
            const pinScreenMatch = source.match(/function PinScreen\([^)]*\)[^{]*\{([\s\S]*?)^function /m);
            assert.ok(pinScreenMatch, 'PinScreen function should exist');

            const pinScreenBody = pinScreenMatch[1];

            // Check if there's a maskedPin variable being rendered alongside TextInput with mask
            const hasMaskedPinRendered = /\{maskedPin\}/.test(pinScreenBody ?? '');
            const hasTextInputWithMask = /TextInput[\s\S]*?mask=/.test(pinScreenBody ?? '');

            // The bug is when both maskedPin is rendered AND TextInput has mask prop
            const hasBug = hasMaskedPinRendered && hasTextInputWithMask;

            assert.strictEqual(
                hasBug,
                false,
                'PinScreen should not render both maskedPin text and TextInput with mask prop - this causes double asterisks. ' +
                    'Either remove the maskedPin rendering or remove the mask prop from TextInput.'
            );
        });
    });
});
