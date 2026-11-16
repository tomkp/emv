import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseArgs, showHelp, showVersion, runCommand } from './cli.js';
import type { CommandContext } from './commands.js';

describe('CLI', () => {
    describe('parseArgs', () => {
        it('should parse help flag', () => {
            const result = parseArgs(['--help']);
            assert.strictEqual(result.options.help, true);
        });

        it('should parse short help flag', () => {
            const result = parseArgs(['-h']);
            assert.strictEqual(result.options.help, true);
        });

        it('should parse version flag', () => {
            const result = parseArgs(['--version']);
            assert.strictEqual(result.options.version, true);
        });

        it('should parse short version flag', () => {
            const result = parseArgs(['-v']);
            assert.strictEqual(result.options.version, true);
        });

        it('should parse command as positional argument', () => {
            const result = parseArgs(['readers']);
            assert.deepStrictEqual(result.positionals, ['readers']);
        });

        it('should parse command with arguments', () => {
            const result = parseArgs(['select-app', 'a0000000041010']);
            assert.deepStrictEqual(result.positionals, ['select-app', 'a0000000041010']);
        });

        it('should parse format option', () => {
            const result = parseArgs(['--format', 'json', 'readers']);
            assert.strictEqual(result.options.format, 'json');
        });

        it('should parse short format option', () => {
            const result = parseArgs(['-f', 'hex', 'info']);
            assert.strictEqual(result.options.format, 'hex');
        });

        it('should parse verbose flag', () => {
            const result = parseArgs(['--verbose', 'info']);
            assert.strictEqual(result.options.verbose, true);
        });

        it('should parse reader option', () => {
            const result = parseArgs(['--reader', 'SCM SCR3500', 'info']);
            assert.strictEqual(result.options.reader, 'SCM SCR3500');
        });

        it('should parse short reader option', () => {
            const result = parseArgs(['-r', 'ACR122U', 'info']);
            assert.strictEqual(result.options.reader, 'ACR122U');
        });
    });

    describe('showHelp', () => {
        it('should return help text containing usage', () => {
            const help = showHelp();
            assert.ok(help.includes('Usage:'));
        });

        it('should list available commands', () => {
            const help = showHelp();
            assert.ok(help.includes('Commands:'));
            assert.ok(help.includes('readers'));
        });

        it('should list options', () => {
            const help = showHelp();
            assert.ok(help.includes('Options:'));
            assert.ok(help.includes('--help'));
            assert.ok(help.includes('--version'));
        });
    });

    describe('showVersion', () => {
        it('should return version string', () => {
            const version = showVersion();
            assert.ok(/^\d+\.\d+\.\d+/.test(version));
        });
    });

    describe('runCommand', () => {
        function createTestContext(): CommandContext & { outputs: string[]; errors: string[] } {
            const outputs: string[] = [];
            const errors: string[] = [];
            return {
                output: (msg: string) => outputs.push(msg),
                error: (msg: string) => errors.push(msg),
                readerName: undefined,
                format: undefined,
                verbose: undefined,
                outputs,
                errors,
            };
        }

        it('should return error for unknown command', async () => {
            const ctx = createTestContext();
            const result = await runCommand('unknown-cmd', [], ctx);
            assert.strictEqual(result, 1);
            assert.ok(ctx.errors[0]?.includes('not yet implemented'));
        });

        it('should require AID for select-app command', async () => {
            const ctx = createTestContext();
            const result = await runCommand('select-app', [], ctx);
            assert.strictEqual(result, 1);
            assert.ok(ctx.errors[0]?.includes('Usage:'));
        });

        it('should require SFI and record for read-record command', async () => {
            const ctx = createTestContext();
            const result = await runCommand('read-record', [], ctx);
            assert.strictEqual(result, 1);
            assert.ok(ctx.errors[0]?.includes('Usage:'));
        });

        it('should require both SFI and record arguments', async () => {
            const ctx = createTestContext();
            const result = await runCommand('read-record', ['1'], ctx);
            assert.strictEqual(result, 1);
            assert.ok(ctx.errors[0]?.includes('Usage:'));
        });

        it('should validate SFI and record are numbers', async () => {
            const ctx = createTestContext();
            const result = await runCommand('read-record', ['abc', 'def'], ctx);
            assert.strictEqual(result, 1);
            assert.ok(ctx.errors[0]?.includes('must be numbers'));
        });

        it('should require tag for get-data command', async () => {
            const ctx = createTestContext();
            const result = await runCommand('get-data', [], ctx);
            assert.strictEqual(result, 1);
            assert.ok(ctx.errors[0]?.includes('Usage:'));
        });

        it('should require PIN for verify-pin command', async () => {
            const ctx = createTestContext();
            const result = await runCommand('verify-pin', [], ctx);
            assert.strictEqual(result, 1);
            assert.ok(ctx.errors[0]?.includes('Usage:'));
        });

        describe('card commands', () => {
            /**
             * Devices that report a card in 'Test Reader' when started, answering
             * each APDU with `respond`.
             */
            function devicesWithCard(respond: (apdu: Buffer) => Buffer) {
                const handlers = new Map<string, (event: unknown) => void>();
                const sent: Buffer[] = [];
                let stopped = false;
                const card = {
                    atr: Buffer.from([0x3b, 0x02, 0x14, 0x50]),
                    protocol: 1,
                    connected: true,
                    transmit: async (apdu: Buffer | number[]) => {
                        const buffer = Buffer.from(apdu);
                        sent.push(buffer);
                        return respond(buffer);
                    },
                };
                const devices = {
                    listReaders: () => [],
                    start: () => {
                        setTimeout(() => {
                            handlers.get('card-inserted')?.({
                                reader: { name: 'Test Reader', state: 0x20, atr: card.atr },
                                card,
                            });
                        }, 0);
                    },
                    stop: () => {
                        stopped = true;
                    },
                    on: (event: string, handler: (event: unknown) => void) => {
                        handlers.set(event, handler);
                    },
                    once: () => {},
                };
                return { devices, sent, isStopped: () => stopped };
            }

            it('should run select-pse against the inserted card', async () => {
                const ctx = createTestContext();
                const { devices, sent, isStopped } = devicesWithCard(() =>
                    Buffer.from([0x6f, 0x00, 0x90, 0x00])
                );

                const result = await runCommand('select-pse', [], ctx, { devices });

                assert.strictEqual(result, 0);
                assert.deepStrictEqual(ctx.errors, []);
                assert.ok(ctx.outputs.includes('PSE selected successfully'));
                assert.strictEqual(sent[0]?.subarray(0, 2).toString('hex'), '00a4');
                assert.ok(isStopped());
            });

            it('should run get-data against the inserted card', async () => {
                const ctx = createTestContext();
                const { devices, sent } = devicesWithCard(() =>
                    Buffer.from([0x9f, 0x17, 0x01, 0x03, 0x90, 0x00])
                );

                const result = await runCommand('get-data', ['9f17'], ctx, { devices });

                assert.strictEqual(result, 0);
                assert.strictEqual(sent[0]?.toString('hex'), '80ca9f1700');
                assert.ok(ctx.outputs.some((o) => o.includes('9f170103')));
            });

            it('should report the card status word when a command fails', async () => {
                const ctx = createTestContext();
                const { devices } = devicesWithCard(() => Buffer.from([0x6a, 0x82]));

                const result = await runCommand('select-app', ['a0000000041010'], ctx, {
                    devices,
                });

                assert.strictEqual(result, 1);
                assert.ok(ctx.errors.some((e) => e.includes('6A82')));
            });
        });
    });
});
