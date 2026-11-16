/**
 * CLI command implementations
 */

import { EmvApplication, discoverApplicationsFrom } from './emv-application.js';
import type { CardResponse, SmartCard } from './types.js';

const SCARD_STATE_PRESENT = 0x20;

/**
 * Context for command execution
 */
export interface CommandContext {
    output: (message: string) => void;
    error: (message: string) => void;
    readerName: string | undefined;
    format: string | undefined;
    verbose: boolean | undefined;
}

/**
 * Minimal Reader interface for commands
 */
interface ReaderInfo {
    name: string;
    state: number;
    atr: Buffer | null;
}

/**
 * Minimal Card interface for commands
 */
interface CardInfo {
    atr: Buffer | null;
    protocol: number;
    connected: boolean;
}

/**
 * Card inserted event
 */
interface CardInsertedEvent {
    reader: ReaderInfo;
    card: CardInfo;
}

/**
 * Minimal Devices interface for dependency injection
 */
interface DevicesLike {
    listReaders(): ReaderInfo[];
    start(): void;
    stop(): void;
    on(event: string, handler: (event: unknown) => void): void;
    once(event: string, handler: (event: unknown) => void): void;
}

/**
 * Minimal EmvApplication interface for dependency injection
 */
export interface EmvLike {
    selectPse?(): Promise<CardResponse>;
    selectPpse?(): Promise<CardResponse>;
    selectApplication?(aid: Buffer | readonly number[]): Promise<CardResponse>;
    readRecord?(sfi: number, record: number): Promise<CardResponse>;
    getData?(tag: number): Promise<CardResponse>;
    verifyPin?(pin: string): Promise<CardResponse>;
    getAtr?(): string;
    getReaderName?(): string;
}

/**
 * Options for commands (for dependency injection in tests)
 */
export interface CommandOptions {
    devices?: DevicesLike;
    emv?: EmvLike;
    timeout?: number;
}

/**
 * List available PC/SC readers
 */
export async function listReaders(
    ctx: CommandContext,
    options: CommandOptions = {}
): Promise<number> {
    const devices = options.devices ?? (await createDevices());

    try {
        let pcscError: Error | undefined;
        devices.on('error', (err) => {
            pcscError = toError(err);
        });
        devices.start();
        // Small delay to allow readers to be detected
        await new Promise((resolve) => setTimeout(resolve, 100));

        const readers = devices.listReaders();

        // With no PC/SC service there are no readers to list, so report why. Errors about
        // a card in one of the readers don't stop the readers being listed.
        if (readers.length === 0 && pcscError) {
            ctx.error(`PC/SC error: ${pcscError.message}`);
            return 1;
        }

        if (readers.length === 0) {
            ctx.output('No readers found');
            return 0;
        }

        ctx.output(`Found ${String(readers.length)} reader(s):\n`);

        for (const reader of readers) {
            const hasCard = (reader.state & SCARD_STATE_PRESENT) !== 0;
            const cardStatus = hasCard ? ' (card present)' : '';
            ctx.output(`  ${reader.name}${cardStatus}`);

            if (hasCard && reader.atr && ctx.verbose) {
                ctx.output(`    ATR: ${reader.atr.toString('hex')}`);
            }
        }

        return 0;
    } finally {
        devices.stop();
    }
}

/**
 * Wait for a card to be inserted
 */
export async function waitForCard(
    ctx: CommandContext,
    options: CommandOptions = {}
): Promise<number> {
    const devices = options.devices ?? (await createDevices());
    const timeout = options.timeout ?? 30000;

    ctx.output('Waiting for card...');
    if (ctx.readerName) {
        ctx.output(`Using reader: ${ctx.readerName}`);
    }

    let event: CardInsertedEvent;
    try {
        event = await nextCard(ctx, devices, timeout);
    } catch (err) {
        ctx.error(toError(err).message);
        return 1;
    } finally {
        devices.stop();
    }

    ctx.output(`Card inserted in: ${event.reader.name}`);
    if (event.card.atr) {
        ctx.output(`ATR: ${event.card.atr.toString('hex')}`);
    }
    return 0;
}

/**
 * Connect to a card and run a command against it.
 *
 * Waits for a card in the reader given with --reader (or in any reader), runs the
 * command with an EmvApplication for that card, then stops monitoring.
 * A card already in a reader counts as inserted when monitoring starts.
 */
export async function withCard(
    ctx: CommandContext,
    run: (emv: EmvLike) => Promise<number>,
    options: CommandOptions = {}
): Promise<number> {
    if (options.emv) {
        return run(options.emv);
    }

    const devices = options.devices ?? (await createDevices());
    const timeout = options.timeout ?? 30000;

    const hint = setTimeout(() => {
        ctx.error(
            ctx.readerName ? `Waiting for a card in ${ctx.readerName}...` : 'Waiting for a card...'
        );
    }, 1000);

    let event: CardInsertedEvent;
    try {
        event = await nextCard(ctx, devices, timeout);
    } catch (err) {
        devices.stop();
        ctx.error(toError(err).message);
        return 1;
    } finally {
        clearTimeout(hint);
    }

    try {
        return await run(new EmvApplication(event.reader, event.card as unknown as SmartCard));
    } finally {
        devices.stop();
    }
}

/**
 * Start monitoring and wait for a card in the requested reader.
 * Rejects on timeout, or on a PC/SC error when there are no readers (no PC/SC service).
 * Other errors may come from a card in another reader (for example, one that can't
 * be connected to), so they are reported and the wait goes on. The error listener
 * stays registered so later PC/SC errors do not crash the process.
 */
function nextCard(
    ctx: CommandContext,
    devices: DevicesLike,
    timeout: number
): Promise<CardInsertedEvent> {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error('Timeout waiting for card'));
        }, timeout);

        devices.on('card-inserted', (event: unknown) => {
            const cardEvent = event as CardInsertedEvent;
            // Ignore cards in other readers
            if (ctx.readerName && cardEvent.reader.name !== ctx.readerName) {
                return;
            }
            clearTimeout(timeoutId);
            resolve(cardEvent);
        });

        devices.on('error', (err: unknown) => {
            const message = `Card reader error: ${toError(err).message}`;
            if (devices.listReaders().length === 0) {
                clearTimeout(timeoutId);
                reject(new Error(message));
            } else {
                ctx.error(message);
            }
        });

        devices.start();
    });
}

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}

/**
 * Create a Devices instance (lazy import to avoid loading native module in tests)
 */
async function createDevices(): Promise<DevicesLike> {
    const { Devices } = await import('smartcard');
    return new Devices() as DevicesLike;
}

const INVALID_AID = 'Invalid AID format. AID must be 5-16 bytes in hex (e.g., a0000000041010)';
const INVALID_TAG = 'Invalid tag format. Tag must be 1-2 bytes in hex (e.g., 9f17)';
const INVALID_PIN = 'Invalid PIN format. PIN must be 4-12 digits.';

/**
 * Check an AID argument. Returns an error message, or undefined if it is valid.
 */
export function aidError(aidHex: string): string | undefined {
    return parseHexAid(aidHex) ? undefined : INVALID_AID;
}

/**
 * Check SFI and record number arguments. Returns an error message, or undefined if they are valid.
 */
export function recordError(sfi: number, record: number): string | undefined {
    if (!Number.isInteger(sfi) || sfi < 1 || sfi > 30) {
        return 'SFI must be an integer between 1 and 30';
    }
    if (!Number.isInteger(record) || record < 0 || record > 255) {
        return 'Record number must be an integer between 0 and 255';
    }
    return undefined;
}

/**
 * Check a tag argument. Returns an error message, or undefined if it is valid.
 */
export function tagError(tagStr: string): string | undefined {
    return parseHexTag(tagStr) === null ? INVALID_TAG : undefined;
}

/**
 * Check a PIN argument. Returns an error message, or undefined if it is valid.
 */
export function pinError(pin: string): string | undefined {
    return /^\d{4,12}$/.test(pin) ? undefined : INVALID_PIN;
}

/**
 * Format status word for display
 */
function formatSw(sw1: number, sw2: number): string {
    return `SW: ${sw1.toString(16).padStart(2, '0').toUpperCase()}${sw2.toString(16).padStart(2, '0').toUpperCase()}`;
}

/**
 * Select Payment System Environment
 */
export async function selectPse(
    ctx: CommandContext,
    options: CommandOptions = {}
): Promise<number> {
    const emv = options.emv;
    if (!emv?.selectPse) {
        ctx.error('EMV application not available');
        return 1;
    }

    const response = await emv.selectPse();

    if (response.isOk()) {
        ctx.output('PSE selected successfully');
        if (ctx.verbose) {
            ctx.output(`Response: ${response.buffer.toString('hex')}`);
        }
        return 0;
    } else {
        ctx.error(`PSE selection failed - ${formatSw(response.sw1, response.sw2)}`);
        return 1;
    }
}

/**
 * Parse hex string to buffer
 */
function parseHexAid(aid: string): Buffer | null {
    // Remove any spaces or dashes
    const cleaned = aid.replace(/[\s-]/g, '');

    // Check valid hex string
    if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
        return null;
    }

    // Must be even length (2 chars per byte)
    if (cleaned.length % 2 !== 0) {
        return null;
    }

    // AID must be 5-16 bytes
    const length = cleaned.length / 2;
    if (length < 5 || length > 16) {
        return null;
    }

    return Buffer.from(cleaned, 'hex');
}

/**
 * Select application by AID
 */
export async function selectApp(
    ctx: CommandContext,
    aidHex: string,
    options: CommandOptions = {}
): Promise<number> {
    const aidBuffer = parseHexAid(aidHex);
    if (!aidBuffer) {
        ctx.error(INVALID_AID);
        return 1;
    }

    const emv = options.emv;
    if (!emv?.selectApplication) {
        ctx.error('EMV application not available');
        return 1;
    }

    const response = await emv.selectApplication(aidBuffer);

    if (response.isOk()) {
        ctx.output(`Application selected: ${aidHex}`);
        if (ctx.verbose) {
            ctx.output(`Response: ${response.buffer.toString('hex')}`);
        }
        return 0;
    } else {
        ctx.error(`Application selection failed - ${formatSw(response.sw1, response.sw2)}`);
        return 1;
    }
}

/**
 * Application information from PSE
 */
export interface PseAppInfo {
    aid: string;
    label: string | undefined;
    priority: number | undefined;
}

/**
 * Record data from PSE
 */
export interface PseRecordData {
    sfi: number;
    record: number;
    data: string;
}

/**
 * Result of reading PSE applications
 */
export interface PseReadResult {
    pseOk: boolean;
    pseBuffer: Buffer;
    sfi: number;
    apps: PseAppInfo[];
    records: PseRecordData[];
    /** Which directory was read: PSE (contact) or PPSE (contactless) */
    source?: 'pse' | 'ppse' | undefined;
}

/**
 * Read applications from the payment system directory (PSE, or PPSE as a fallback).
 * This is a shared helper used by listApps, cardInfo, and dumpCard.
 */
export async function readPseApplications(options: CommandOptions = {}): Promise<PseReadResult> {
    const emv = options.emv;
    const selectPse = emv?.selectPse?.bind(emv);
    const readRecord = emv?.readRecord?.bind(emv);
    if (!selectPse || !readRecord) {
        return { pseOk: false, pseBuffer: Buffer.alloc(0), sfi: 1, apps: [], records: [] };
    }
    const selectPpse = emv?.selectPpse?.bind(emv);

    const result = await discoverApplicationsFrom(
        selectPpse ? { selectPse, selectPpse, readRecord } : { selectPse, readRecord }
    );
    if (!result.success) {
        return { pseOk: false, pseBuffer: Buffer.alloc(0), sfi: 1, apps: [], records: [] };
    }

    return {
        pseOk: true,
        pseBuffer: result.pseBuffer ?? Buffer.alloc(0),
        sfi: result.sfi,
        source: result.source,
        apps: result.apps.map((app) => ({
            aid: app.aid,
            label: app.label,
            priority: app.priority,
        })),
        records: (result.records ?? []).map((record) => ({
            sfi: record.sfi,
            record: record.recordNumber,
            data: record.data.toString('hex'),
        })),
    };
}

/**
 * List applications on card from PSE
 */
export async function listApps(ctx: CommandContext, options: CommandOptions = {}): Promise<number> {
    const result = await readPseApplications(options);

    if (!result.pseOk) {
        ctx.error('EMV application not available or PSE selection failed');
        return 1;
    }

    if (result.apps.length === 0) {
        ctx.output('No applications found on card');
        return 0;
    }

    ctx.output(`Found ${String(result.apps.length)} application(s):\n`);

    for (const app of result.apps) {
        const labelStr = app.label ? ` - ${app.label}` : '';
        const priorityStr =
            app.priority !== undefined ? ` (priority: ${String(app.priority)})` : '';
        ctx.output(`  ${app.aid}${labelStr}${priorityStr}`);
    }

    return 0;
}

/**
 * Read a record from an SFI
 */
export async function readRecord(
    ctx: CommandContext,
    sfi: number,
    record: number,
    options: CommandOptions = {}
): Promise<number> {
    const argumentError = recordError(sfi, record);
    if (argumentError) {
        ctx.error(argumentError);
        return 1;
    }

    const emv = options.emv;
    if (!emv?.readRecord) {
        ctx.error('EMV application not available');
        return 1;
    }

    const response = await emv.readRecord(sfi, record);

    if (response.isOk()) {
        ctx.output(`Record ${String(record)} from SFI ${String(sfi)}:`);
        ctx.output(`Data: ${response.buffer.toString('hex')}`);
        return 0;
    } else {
        ctx.error(`Read record failed - ${formatSw(response.sw1, response.sw2)}`);
        return 1;
    }
}

/**
 * Parse hex tag string to number
 */
function parseHexTag(tagStr: string): number | null {
    // Remove any 0x prefix
    const cleaned = tagStr.replace(/^0x/i, '').toLowerCase();

    // Check valid hex string (1-4 hex chars for 1-2 byte tags)
    if (!/^[0-9a-f]{1,4}$/.test(cleaned)) {
        return null;
    }

    return parseInt(cleaned, 16);
}

/**
 * Get data by EMV tag
 */
export async function getData(
    ctx: CommandContext,
    tagStr: string,
    options: CommandOptions = {}
): Promise<number> {
    const tag = parseHexTag(tagStr);
    if (tag === null) {
        ctx.error(INVALID_TAG);
        return 1;
    }

    const emv = options.emv;
    if (!emv?.getData) {
        ctx.error('EMV application not available');
        return 1;
    }

    const response = await emv.getData(tag);

    if (response.isOk()) {
        const tagHex = tagStr.toLowerCase();
        ctx.output(`Tag ${tagHex}:`);
        ctx.output(`Data: ${response.buffer.toString('hex')}`);
        return 0;
    } else {
        ctx.error(`Get data failed - ${formatSw(response.sw1, response.sw2)}`);
        return 1;
    }
}

/**
 * Verify PIN
 */
export async function verifyPin(
    ctx: CommandContext,
    pin: string,
    options: CommandOptions = {}
): Promise<number> {
    const argumentError = pinError(pin);
    if (argumentError) {
        ctx.error(argumentError);
        return 1;
    }

    const emv = options.emv;
    if (!emv?.verifyPin) {
        ctx.error('EMV application not available');
        return 1;
    }

    const response = await emv.verifyPin(pin);

    if (response.isOk()) {
        ctx.output('PIN verified successfully');
        return 0;
    } else if (response.sw1 === 0x63 && (response.sw2 & 0xf0) === 0xc0) {
        const attemptsLeft = response.sw2 & 0x0f;
        ctx.error(`Wrong PIN. ${String(attemptsLeft)} attempt(s) remaining.`);
        return 1;
    } else if (response.sw1 === 0x69 && response.sw2 === 0x83) {
        ctx.error('PIN is blocked. Card cannot be used.');
        return 1;
    } else {
        ctx.error(`PIN verification failed - ${formatSw(response.sw1, response.sw2)}`);
        return 1;
    }
}

/**
 * Show card information
 */
export async function cardInfo(ctx: CommandContext, options: CommandOptions = {}): Promise<number> {
    const emv = options.emv;
    if (!emv?.getAtr || !emv.getReaderName) {
        ctx.error('EMV application not available');
        return 1;
    }

    const pseResult = await readPseApplications(options);
    const apps = pseResult.apps.map((app) => ({ aid: app.aid, label: app.label }));

    // Output based on format
    if (ctx.format === 'json') {
        const result = {
            reader: emv.getReaderName(),
            atr: emv.getAtr(),
            applications: apps,
        };
        ctx.output(JSON.stringify(result, null, 2));
    } else {
        // Text format (default)
        ctx.output('Card Information:');
        ctx.output(`  Reader: ${emv.getReaderName()}`);
        ctx.output(`  ATR: ${emv.getAtr()}`);
        ctx.output('');

        if (apps.length > 0) {
            ctx.output('Applications:');
            for (const app of apps) {
                const labelStr = app.label ? ` (${app.label})` : '';
                ctx.output(`  ${app.aid}${labelStr}`);
            }
        } else if (pseResult.pseOk) {
            ctx.output('No applications found');
        } else {
            ctx.output('No payment directory found (PSE or PPSE)');
        }
    }

    return 0;
}

/**
 * Dump all readable data from card
 */
export async function dumpCard(ctx: CommandContext, options: CommandOptions = {}): Promise<number> {
    const emv = options.emv;
    if (!emv?.getAtr) {
        ctx.error('EMV application not available');
        return 1;
    }

    const pseResult = await readPseApplications(options);
    const pseHex = pseResult.pseBuffer.toString('hex');

    // Output based on format
    if (ctx.format === 'json') {
        const result = {
            atr: emv.getAtr(),
            directory: pseResult.source,
            pse: pseHex,
            records: pseResult.records,
        };
        ctx.output(JSON.stringify(result, null, 2));
    } else {
        // Text format (default)
        ctx.output('EMV Card Dump');
        ctx.output('=============');
        ctx.output('');
        ctx.output(`ATR: ${emv.getAtr()}`);
        ctx.output('');

        if (pseResult.pseOk) {
            ctx.output(`${pseResult.source === 'ppse' ? 'PPSE' : 'PSE'} Response:`);
            ctx.output(`  ${pseHex}`);
            ctx.output('');

            // The PPSE lists applications in its response and has no records
            if (pseResult.source !== 'ppse') {
                ctx.output(`Reading SFI ${String(pseResult.sfi)}:`);
                for (const rec of pseResult.records) {
                    ctx.output(`  Record ${String(rec.record)}: ${rec.data}`);
                }
            }
        } else {
            ctx.output('PSE and PPSE selection failed');
        }
    }

    return 0;
}

/**
 * Result of processing a shell command
 */
export interface ShellCommandResult {
    action: 'continue' | 'exit';
}

/**
 * Show shell help text
 */
function showShellHelp(ctx: CommandContext): void {
    ctx.output('Available Commands:');
    ctx.output('  help                      Show this help message');
    ctx.output('  select-pse                Select Payment System Environment');
    ctx.output('  select-app <aid>          Select application by AID');
    ctx.output('  read-record <sfi> <rec>   Read a record from SFI');
    ctx.output('  get-data <tag>            Get data by EMV tag');
    ctx.output('  list-apps                 List applications on card');
    ctx.output('  info                      Show card information');
    ctx.output('  quit, exit                Exit interactive mode');
}

/**
 * Process a command in the interactive shell
 */
export async function processShellCommand(
    ctx: CommandContext,
    input: string,
    options: CommandOptions = {}
): Promise<ShellCommandResult> {
    const trimmed = input.trim();
    if (!trimmed) {
        return { action: 'continue' };
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    switch (cmd) {
        case 'help':
        case '?':
            showShellHelp(ctx);
            return { action: 'continue' };

        case 'quit':
        case 'exit':
            return { action: 'exit' };

        case 'select-pse':
            await selectPse(ctx, options);
            return { action: 'continue' };

        case 'select-app': {
            const aid = args[0];
            if (!aid) {
                ctx.error('Usage: select-app <aid>');
            } else {
                await selectApp(ctx, aid, options);
            }
            return { action: 'continue' };
        }

        case 'read-record': {
            const sfiArg = args[0];
            const recordArg = args[1];
            if (!sfiArg || !recordArg) {
                ctx.error('Usage: read-record <sfi> <record>');
            } else {
                const sfi = parseInt(sfiArg, 10);
                const record = parseInt(recordArg, 10);
                if (Number.isNaN(sfi) || Number.isNaN(record)) {
                    ctx.error('SFI and record must be numbers');
                } else {
                    await readRecord(ctx, sfi, record, options);
                }
            }
            return { action: 'continue' };
        }

        case 'get-data': {
            const tag = args[0];
            if (!tag) {
                ctx.error('Usage: get-data <tag>');
            } else {
                await getData(ctx, tag, options);
            }
            return { action: 'continue' };
        }

        case 'list-apps':
            await listApps(ctx, options);
            return { action: 'continue' };

        case 'info':
            await cardInfo(ctx, options);
            return { action: 'continue' };

        default:
            ctx.error(`Unknown command: ${String(cmd)}. Type 'help' for available commands.`);
            return { action: 'continue' };
    }
}
