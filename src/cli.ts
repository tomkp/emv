#!/usr/bin/env node
import { parseArgs as nodeParseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    listReaders,
    waitForCard,
    selectPse,
    selectApp,
    listApps,
    type CommandContext,
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

Usage: emv [options] <command> [arguments]

Commands:
  readers              List available PC/SC readers
  wait                 Wait for card insertion
  info                 Show card information
  select-pse           Select Payment System Environment
  select-app <aid>     Select application by AID
  list-apps            List applications on card
  read-record <sfi> <record>  Read a record
  get-data <tag>       Get data by EMV tag
  dump                 Dump all readable card data
  shell                Interactive mode

Options:
  -h, --help           Show this help message
  -v, --version        Show version number
  -f, --format <type>  Output format: text, json, hex (default: text)
  --verbose            Show detailed output
  -r, --reader <name>  Use specific reader by name

Examples:
  emv readers                    List all connected readers
  emv wait                       Wait for a card to be inserted
  emv info                       Show card ATR and basic info
  emv select-pse                 Select PSE directory
  emv select-app a0000000041010  Select Mastercard application
  emv read-record 1 1            Read record 1 from SFI 1
  emv get-data 9f17              Get PIN try counter
  emv dump --format json         Dump card data as JSON
  emv shell                      Start interactive mode
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
 * Run a command and handle errors
 */
async function runCommand(
    command: string,
    args: string[],
    ctx: CommandContext
): Promise<number> {
    switch (command) {
        case 'readers':
            return listReaders(ctx);
        case 'wait':
            return waitForCard(ctx);
        case 'select-pse':
            return selectPse(ctx);
        case 'select-app': {
            const aid = args[0];
            if (!aid) {
                ctx.error('Usage: emv select-app <aid>');
                return 1;
            }
            return selectApp(ctx, aid);
        }
        case 'list-apps':
            return listApps(ctx);
        default:
            ctx.error(`Command '${command}' not yet implemented`);
            return 1;
    }
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
        console.log(showHelp());
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
