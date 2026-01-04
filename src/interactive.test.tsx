import { describe, it } from 'node:test';
import assert from 'node:assert';
import { useState } from 'react';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { PinScreen } from './interactive.js';
import { WelcomeScreen } from './interactive/screens/WelcomeScreen.js';
import { ReadersScreen } from './interactive/screens/ReadersScreen.js';
import { WaitingScreen } from './interactive/screens/WaitingScreen.js';
import { AppsScreen } from './interactive/screens/AppsScreen.js';
import { SelectedAppScreen } from './interactive/screens/SelectedAppScreen.js';
import { PinResultScreen } from './interactive/screens/PinResultScreen.js';
import { ErrorScreen } from './interactive/screens/ErrorScreen.js';
import { Header } from './interactive/components/Header.js';

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
    });

    describe('PinScreen', () => {
        const noop = () => {};

        it('should render PIN input when raw mode is supported', () => {
            const { lastFrame, unmount } = render(
                <PinScreen
                    onSubmit={noop}
                    onBack={noop}
                    loading={false}
                    attemptsLeft={3}
                    isRawModeSupported={true}
                />
            );

            const frame = lastFrame() ?? '';
            unmount();

            // Should show PIN input field (not the fallback message)
            assert.ok(frame.includes('PIN:'), 'Should display PIN label');
            assert.ok(
                !frame.includes('raw mode not supported'),
                'Should not show raw mode fallback'
            );
        });

        it('should show fallback message when raw mode is not supported', () => {
            const { lastFrame, unmount } = render(
                <PinScreen
                    onSubmit={noop}
                    onBack={noop}
                    loading={false}
                    attemptsLeft={3}
                    isRawModeSupported={false}
                />
            );

            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(
                frame.includes('raw mode not supported'),
                'Should show raw mode not supported message'
            );
        });

        it('should show loading state', () => {
            const { lastFrame, unmount } = render(
                <PinScreen
                    onSubmit={noop}
                    onBack={noop}
                    loading={true}
                    attemptsLeft={3}
                    isRawModeSupported={true}
                />
            );

            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(
                frame.includes('Verifying PIN'),
                'Should show verifying message when loading'
            );
        });

        it('should show warning when attempts are low', () => {
            const { lastFrame, unmount } = render(
                <PinScreen
                    onSubmit={noop}
                    onBack={noop}
                    loading={false}
                    attemptsLeft={1}
                    isRawModeSupported={true}
                />
            );

            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('1 attempt'), 'Should show attempts remaining warning');
        });
    });

    describe('WelcomeScreen', () => {
        it('should render welcome message', () => {
            const { lastFrame, unmount } = render(<WelcomeScreen onContinue={() => {}} />);
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('Welcome'));
        });
    });

    describe('ReadersScreen', () => {
        it('should show loading state', () => {
            const { lastFrame, unmount } = render(
                <ReadersScreen
                    readers={[]}
                    onSelect={() => {}}
                    onRefresh={() => {}}
                    loading={true}
                />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('Scanning'));
        });

        it('should show no readers message', () => {
            const { lastFrame, unmount } = render(
                <ReadersScreen
                    readers={[]}
                    onSelect={() => {}}
                    onRefresh={() => {}}
                    loading={false}
                />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('No card readers'));
        });

        it('should list readers', () => {
            const readers = [{ name: 'Test Reader', state: 0, atr: null }];
            const { lastFrame, unmount } = render(
                <ReadersScreen
                    readers={readers}
                    onSelect={() => {}}
                    onRefresh={() => {}}
                    loading={false}
                />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('Test Reader'));
        });
    });

    describe('WaitingScreen', () => {
        it('should show reader name', () => {
            const { lastFrame, unmount } = render(<WaitingScreen readerName="My Reader" />);
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('My Reader'));
        });
    });

    describe('AppsScreen', () => {
        it('should show loading state', () => {
            const { lastFrame, unmount } = render(
                <AppsScreen
                    apps={[]}
                    readerName="Reader"
                    atr="3B00"
                    onSelect={() => {}}
                    onBack={() => {}}
                    loading={true}
                />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('Reading'));
        });

        it('should show no apps message', () => {
            const { lastFrame, unmount } = render(
                <AppsScreen
                    apps={[]}
                    readerName="Reader"
                    atr="3B00"
                    onSelect={() => {}}
                    onBack={() => {}}
                    loading={false}
                />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('No applications'));
        });

        it('should list apps', () => {
            const apps = [{ aid: 'A0000000041010', label: 'Mastercard' }];
            const { lastFrame, unmount } = render(
                <AppsScreen
                    apps={apps}
                    readerName="Reader"
                    atr="3B00"
                    onSelect={() => {}}
                    onBack={() => {}}
                    loading={false}
                />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('Mastercard'));
        });
    });

    describe('SelectedAppScreen', () => {
        it('should show app details', () => {
            const app = { aid: 'A0000000041010', label: 'Mastercard', priority: 1 };
            const { lastFrame, unmount } = render(
                <SelectedAppScreen
                    app={app}
                    onVerifyPin={() => {}}
                    onExplore={() => {}}
                    onBack={() => {}}
                />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('Mastercard'));
            assert.ok(frame.includes('A0000000041010'));
        });
    });

    describe('PinResultScreen', () => {
        it('should show success', () => {
            const { lastFrame, unmount } = render(
                <PinResultScreen
                    success={true}
                    message="PIN OK"
                    attemptsLeft={undefined}
                    onContinue={() => {}}
                />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('PIN OK'));
        });

        it('should show failure with attempts', () => {
            const { lastFrame, unmount } = render(
                <PinResultScreen
                    success={false}
                    message="Wrong PIN"
                    attemptsLeft={2}
                    onContinue={() => {}}
                />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('Wrong PIN'));
            assert.ok(frame.includes('2'));
        });
    });

    describe('ErrorScreen', () => {
        it('should show error message', () => {
            const { lastFrame, unmount } = render(
                <ErrorScreen message="Something broke" onBack={() => {}} />
            );
            const frame = lastFrame() ?? '';
            unmount();
            assert.ok(frame.includes('Something broke'));
        });
    });

    describe('Header', () => {
        // Helper to strip ANSI escape codes from string
        const stripAnsi = (str: string): string =>
            // eslint-disable-next-line no-control-regex
            str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

        it('should render ASCII art with correct EMV letter spacing and border', () => {
            const { lastFrame, unmount } = render(<Header />);
            const frame = lastFrame() ?? '';
            unmount();

            // Strip ANSI codes and normalize whitespace
            // ink-testing-library may include color codes and varying indentation
            const normalizedFrame = stripAnsi(frame)
                .split('\n')
                .map((line) => line.trimStart())
                .join('\n');

            // These exact strings define the EMV ASCII art structure with borders
            // The spaces are critical for proper letter alignment
            // prettier-ignore
            const expectedAsciiPatterns = [
                '║  ███████╗███╗   ███╗██╗   ██╗                                 ║', // Row 1
                '║  ██╔════╝████╗ ████║██║   ██║', // Row 2 (has title text after)
                '║  █████╗  ██╔████╔██║██║   ██║', // Row 3 (has title text after)
                '║  ██╔══╝  ██║╚██╔╝██║╚██╗ ██╔╝                                 ║', // Row 4
                '║  ███████╗██║ ╚═╝ ██║ ╚████╔╝', // Row 5 (has version after)
                '║  ╚══════╝╚═╝     ╚═╝  ╚═══╝                                   ║', // Row 6
            ];

            for (const pattern of expectedAsciiPatterns) {
                assert.ok(
                    normalizedFrame.includes(pattern),
                    `ASCII art is malformed - missing pattern: "${pattern}". ` +
                        'The spacing in the EMV logo has been corrupted.\n' +
                        `Actual frame (normalized):\n${normalizedFrame}`
                );
            }
        });

        it('should render title text', () => {
            const { lastFrame, unmount } = render(<Header />);
            const frame = lastFrame() ?? '';
            unmount();

            assert.ok(frame.includes('Chip'), 'Should include "Chip" in title');
            assert.ok(frame.includes('PIN'), 'Should include "PIN" in title');
            assert.ok(frame.includes('Explorer'), 'Should include "Explorer" in title');
            assert.ok(frame.includes('Interactive Mode'), 'Should include "Interactive Mode"');
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
            assert.strictEqual(
                buggyMaskCount,
                8,
                'Buggy component should show 8 masks (double masking)'
            );

            // Fixed version has 4 masks (just from TextInput)
            assert.strictEqual(
                fixedMaskCount,
                4,
                'Fixed component should show 4 masks (single masking)'
            );
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
