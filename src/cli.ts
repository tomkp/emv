#!/usr/bin/env node
import { parseArgs as nodeParseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import {
    listReaders,
    waitForCard,
    selectPse,
    selectApp,
    listApps,
    readRecord,
    getData,
    verifyPin,
    cardInfo,
    dumpCard,
    processShellCommand,
    withCard,
    aidError,
    recordError,
    tagError,
    pinError,
    type CommandContext,
    type CommandOptions,
} from './commands.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ParsedOptions {
    help: boolean;
    version: boolean;
    format: string | undefined;
    verbose: boolean;
    reader: string | undefined;
}

interface ParsedArgs {
    options: ParsedOptions;
    positionals: string[];
}

/**
 * Parse command line arguments
 */
export function parseArgs(args: string[]): ParsedArgs {
    const { values, positionals } = nodeParseArgs({
        args,
        options: {
            help: { type: 'boolean', short: 'h' },
            version: { type: 'boolean', short: 'v' },
            format: { type: 'string', short: 'f' },
            verbose: { type: 'boolean' },
            reader: { type: 'string', short: 'r' },
        },
        allowPositionals: true,
    });

    return {
        options: {
            help: values.help ?? false,
            version: values.version ?? false,
            format: values.format,
            verbose: values.verbose ?? false,
            reader: values.reader,
        },
        positionals,
    };
}

/**
 * Show help text
 */
export function showHelp(): string {
    return `EMV CLI - Interact with EMV chip cards

Usage: emv [options] [command] [arguments]

Commands:
  (no command)         Start interactive mode with beautiful UI
  readers              List available PC/SC readers
  wait                 Wait for card insertion
  info                 Show card information
  select-pse           Select Payment System Environment
  select-app <aid>     Select application by AID
  list-apps            List applications on card
  read-record <sfi> <record>  Read a record
  get-data <tag>       Get data by EMV tag
  verify-pin <pin>     Verify cardholder PIN
  dump                 Dump all readable card data
  shell                Text-based interactive mode

Options:
  -h, --help           Show this help message
  -v, --version        Show version number
  -f, --format <type>  Output format: text, json (default: text)
  --verbose            Show detailed output
  -r, --reader <name>  Use specific reader by name

Examples:
  emv                            Start interactive UI mode
  emv readers                    List all connected readers
  emv wait                       Wait for a card to be inserted
  emv info                       Show card ATR and basic info
  emv select-pse                 Select PSE directory
  emv select-app a0000000041010  Select Mastercard application
  emv read-record 1 1            Read record 1 from SFI 1
  emv get-data 9f17              Get PIN try counter
  emv dump --format json         Dump card data as JSON
  emv shell                      Start text-based interactive mode
`;
}

/**
 * Get package version
 */
export function showVersion(): string {
    try {
        const packagePath = join(__dirname, '..', 'package.json');
        const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string };
        return pkg.version;
    } catch {
        return '0.0.0';
    }
}

/**
 * Create command context from parsed options
 */
function createContext(options: ParsedOptions): CommandContext {
    return {
        output: (msg: string) => {
            console.log(msg);
        },
        error: (msg: string) => {
            console.error(msg);
        },
        readerName: options.reader,
        format: options.format,
        verbose: options.verbose,
    };
}

/**
 * Report an argument error, if there is one. Arguments are checked before
 * waiting for a card, so a mistyped command fails straight away.
 */
function invalidArgument(ctx: CommandContext, error: string | undefined): boolean {
    if (error) {
        ctx.error(error);
    }
    return error !== undefined;
}

/**
 * Run a command and handle errors.
 * Card commands wait for a card (see withCard) and run against it.
 * @param options - Devices or EMV application to use instead of the real ones (for tests)
 */
export async function runCommand(
    command: string,
    args: string[],
    ctx: CommandContext,
    options: CommandOptions = {}
): Promise<number> {
    switch (command) {
        case 'readers':
            return listReaders(ctx, options);
        case 'wait':
            return waitForCard(ctx, options);
        case 'select-pse':
            return withCard(ctx, (emv) => selectPse(ctx, { emv }), options);
        case 'select-app': {
            const aid = args[0];
            if (!aid) {
                ctx.error('Usage: emv select-app <aid>');
                return 1;
            }
            if (invalidArgument(ctx, aidError(aid))) return 1;
            return withCard(ctx, (emv) => selectApp(ctx, aid, { emv }), options);
        }
        case 'list-apps':
            return withCard(ctx, (emv) => listApps(ctx, { emv }), options);
        case 'read-record': {
            const sfiArg = args[0];
            const recordArg = args[1];
            if (!sfiArg || !recordArg) {
                ctx.error('Usage: emv read-record <sfi> <record>');
                return 1;
            }
            const sfi = parseInt(sfiArg, 10);
            const record = parseInt(recordArg, 10);
            if (Number.isNaN(sfi) || Number.isNaN(record)) {
                ctx.error('SFI and record must be numbers');
                return 1;
            }
            if (invalidArgument(ctx, recordError(sfi, record))) return 1;
            return withCard(ctx, (emv) => readRecord(ctx, sfi, record, { emv }), options);
        }
        case 'get-data': {
            const tagArg = args[0];
            if (!tagArg) {
                ctx.error('Usage: emv get-data <tag>');
                return 1;
            }
            if (invalidArgument(ctx, tagError(tagArg))) return 1;
            return withCard(ctx, (emv) => getData(ctx, tagArg, { emv }), options);
        }
        case 'verify-pin': {
            const pin = args[0];
            if (!pin) {
                ctx.error('Usage: emv verify-pin <pin>');
                return 1;
            }
            if (invalidArgument(ctx, pinError(pin))) return 1;
            return withCard(ctx, (emv) => verifyPin(ctx, pin, { emv }), options);
        }
        case 'info':
            return withCard(ctx, (emv) => cardInfo(ctx, { emv }), options);
        case 'dump':
            return withCard(ctx, (emv) => dumpCard(ctx, { emv }), options);
        case 'shell':
            return withCard(ctx, (emv) => runShell(ctx, { emv }), options);
        default:
            ctx.error(`Command '${command}' not yet implemented`);
            return 1;
    }
}

/**
 * Run interactive shell mode against a connected card
 */
async function runShell(ctx: CommandContext, options: CommandOptions): Promise<number> {
    ctx.output('EMV Interactive Shell');
    ctx.output('Type "help" for available commands, "quit" to exit');
    ctx.output('');

    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        const prompt = (): void => {
            rl.question('emv> ', (input) => {
                void (async () => {
                    try {
                        const result = await processShellCommand(ctx, input, options);
                        if (result.action === 'exit') {
                            rl.close();
                            resolve(0);
                            return;
                        }
                        prompt();
                    } catch (error: unknown) {
                        ctx.error(
                            `Error: ${error instanceof Error ? error.message : String(error)}`
                        );
                        prompt();
                    }
                })();
            });
        };

        rl.on('close', () => {
            resolve(0);
        });

        prompt();
    });
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));

    if (args.options.help) {
        console.log(showHelp());
        return;
    }

    if (args.options.version) {
        console.log(showVersion());
        return;
    }

    const command = args.positionals[0];

    if (!command) {
        // Default to interactive mode when no command given
        const { runInteractive } = await import('./interactive.js');
        runInteractive();
        return;
    }

    const ctx = createContext(args.options);
    const commandArgs = args.positionals.slice(1);
    process.exitCode = await runCommand(command, commandArgs, ctx);
}

main().catch((error: unknown) => {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
