import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseArgs, showHelp, showVersion } from './cli.js';

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
});
