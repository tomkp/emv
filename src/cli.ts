#!/usr/bin/env node
import { parseArgs as nodeParseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
 * Main CLI entry point
 */
function main(): void {
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

    // Commands will be implemented in subsequent steps
    console.error(`Command '${command}' not yet implemented`);
    process.exitCode = 1;
}

main();
