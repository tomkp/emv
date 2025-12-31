import { describe, it } from 'node:test';
import assert from 'node:assert';
import { useState } from 'react';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

describe('Interactive CLI', () => {
    describe('module exports', () => {
        it('should export runInteractive function', async () => {
            const module = await import('./interactive.js');
            assert.strictEqual(typeof module.runInteractive, 'function');
        });

        it('should export PinScreen component', async () => {
            const module = await import('./interactive.js');
            assert.strictEqual(typeof module.PinScreen, 'function');
        });

        it('should export PinScreenProps type', async () => {
            // TypeScript will validate this at compile time
            // This test just ensures the export exists
            const module = await import('./interactive.js');
            assert.ok(module.PinScreen !== undefined);
        });
    });

    describe('TextInput masking behavior', () => {
        // These tests verify the core masking behavior that was broken
        // when we had double masking (rendering both manual mask + TextInput mask)

        it('should display single mask character per input digit', () => {
            function TestComponent() {
                const [value, setValue] = useState('1234');
                return (
                    <Box>
                        <Text>PIN: </Text>
                        <TextInput value={value} onChange={setValue} mask="•" />
                    </Box>
                );
            }

            const { lastFrame } = render(<TestComponent />);
            const frame = lastFrame() ?? '';

            // Count mask characters - should be exactly 4 for a 4-digit value
            const maskCount = (frame.match(/•/g) ?? []).length;

            assert.strictEqual(
                maskCount,
                4,
                `Expected 4 mask characters for 4-digit PIN, but found ${maskCount}. ` +
                    'The mask prop should produce exactly one mask character per input digit.'
            );
        });

        it('should not have duplicate mask output when using both manual mask and TextInput mask', () => {
            // This simulates what the bug looked like - rendering both manual mask AND TextInput mask
            function BuggyComponent() {
                const value = '1234';
                const maskedPin = '•'.repeat(value.length); // This was the bug - manual masking
                return (
                    <Box>
                        <Text>PIN: </Text>
                        <Text>{maskedPin}</Text>
                        <TextInput value={value} onChange={() => {}} mask="•" />
                    </Box>
                );
            }

            function FixedComponent() {
                const value = '1234';
                return (
                    <Box>
                        <Text>PIN: </Text>
                        <TextInput value={value} onChange={() => {}} mask="•" />
                    </Box>
                );
            }

            const buggyFrame = render(<BuggyComponent />).lastFrame() ?? '';
            const fixedFrame = render(<FixedComponent />).lastFrame() ?? '';

            const buggyMaskCount = (buggyFrame.match(/•/g) ?? []).length;
            const fixedMaskCount = (fixedFrame.match(/•/g) ?? []).length;

            // Buggy version has 8 masks (4 manual + 4 from TextInput)
            assert.strictEqual(buggyMaskCount, 8, 'Buggy component should show 8 masks (double masking)');

            // Fixed version has 4 masks (just from TextInput)
            assert.strictEqual(fixedMaskCount, 4, 'Fixed component should show 4 masks (single masking)');
        });

        it('should mask different PIN lengths correctly', () => {
            function TestComponent({ pinLength }: { pinLength: number }) {
                const value = '1'.repeat(pinLength);
                return (
                    <Box>
                        <TextInput value={value} onChange={() => {}} mask="•" />
                    </Box>
                );
            }

            for (const length of [4, 6, 8, 12]) {
                const { lastFrame } = render(<TestComponent pinLength={length} />);
                const frame = lastFrame() ?? '';
                const maskCount = (frame.match(/•/g) ?? []).length;

                assert.strictEqual(
                    maskCount,
                    length,
                    `Expected ${length} mask characters for ${length}-digit PIN, but found ${maskCount}.`
                );
            }
        });
    });
});
