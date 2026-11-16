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
import { formatSw } from './interactive/format.js';
import { formatRecord, processingOptions, readApplicationRecords } from './interactive/explore.js';
import { EmvApplication } from './emv-application.js';

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

describe('formatSw', () => {
    it('should show the status word as four hex digits', () => {
        assert.strictEqual(formatSw({ sw1: 0x67, sw2: 0x00 }), '6700');
        assert.strictEqual(formatSw({ sw1: 0x6a, sw2: 0x82 }), '6A82');
        assert.strictEqual(formatSw({ sw1: 0x63, sw2: 0xc2 }), '63C2');
    });
});

describe('Explorer card reads', () => {
    const aid = Buffer.from('a0000000031010', 'hex');
    // FCI: 6F [84 AID, A5 []]
    const fci = Buffer.from('6f0b8407a0000000031010a500' + '9000', 'hex');
    // GPO format 1: AIP 1C00, AFL SFI 1 records 11-12
    const gpo = Buffer.from('80061c00080b0c00' + '9000', 'hex');

    /** A card that answers GPO once per selection, then refuses it with 6985 */
    function card() {
        const sent: Buffer[] = [];
        let gpoDone = false;
        return {
            sent,
            card: {
                atr: Buffer.from([0x3b, 0x00]),
                transmit: async (apdu: Buffer | number[]) => {
                    const buffer = Buffer.from(apdu);
                    sent.push(buffer);
                    switch (buffer[1]) {
                        case 0xa4:
                            gpoDone = false;
                            return fci;
                        case 0xa8:
                            if (gpoDone) return Buffer.from([0x69, 0x85]);
                            gpoDone = true;
                            return gpo;
                        case 0xb2:
                            // Only records 11 and 12 exist
                            return (buffer[2] ?? 0) >= 11
                                ? Buffer.from([0x70, 0x01, buffer[2] ?? 0, 0x90, 0x00])
                                : Buffer.from([0x6a, 0x83]);
                        default:
                            return Buffer.from([0x6d, 0x00]);
                    }
                },
            },
        };
    }

    it('should read records from the AFL of an earlier GPO without sending GPO again', async () => {
        const { card: c, sent } = card();
        const emv = new EmvApplication({ name: 'Reader' }, c);
        await emv.selectApplication(aid);

        await processingOptions(emv);
        const records = await readApplicationRecords(emv);

        assert.deepStrictEqual(
            records.map((r) => r.recordNumber),
            [11, 12]
        );
        assert.strictEqual(sent.filter((a) => a[1] === 0xa8).length, 1);
    });

    it('should not send GPO when reading records', async () => {
        const { card: c, sent } = card();
        const emv = new EmvApplication({ name: 'Reader' }, c);
        await emv.selectApplication(aid);

        await readApplicationRecords(emv);

        assert.strictEqual(sent.filter((a) => a[1] === 0xa8).length, 0);
    });

    it('should not follow the AFL from an earlier selection', async () => {
        const { card: c, sent } = card();
        const emv = new EmvApplication({ name: 'Reader' }, c);
        await emv.selectApplication(aid);
        await processingOptions(emv);

        await emv.selectApplication(aid);
        await readApplicationRecords(emv);

        // Scans from SFI 1, record 1 instead of reading records 11 and 12 from the old AFL
        const firstRead = sent.find((a) => a[1] === 0xb2);
        assert.strictEqual(firstRead?.subarray(2, 4).toString('hex'), '010c');
    });

    it('should show a record that is not TLV as hex', () => {
        assert.strictEqual(formatRecord(Buffer.from('ffffff01', 'hex')), 'ffffff01');
    });
});
