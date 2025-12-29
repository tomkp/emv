import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Interactive CLI', () => {
    describe('module exports', () => {
        it('should export runInteractive function', async () => {
            const module = await import('./interactive.js');
            assert.strictEqual(typeof module.runInteractive, 'function');
        });
    });
});
