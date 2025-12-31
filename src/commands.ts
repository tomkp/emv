/**
 * CLI command implementations
 */

import { findTagInBuffer } from './emv-tags.js';
import type { CardResponse } from './types.js';
import type { DiscoveredApp, DiscoverAppsResult } from './emv-application.js';

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
interface EmvLike {
    selectPse?(): Promise<CardResponse>;
    selectApplication?(aid: Buffer | readonly number[]): Promise<CardResponse>;
    readRecord?(sfi: number, record: number): Promise<CardResponse>;
    getData?(tag: number): Promise<CardResponse>;
    verifyPin?(pin: string): Promise<CardResponse>;
    getAtr?(): string;
    getReaderName?(): string;
    discoverApplications?(): Promise<DiscoverAppsResult>;
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
        devices.start();
        // Small delay to allow readers to be detected
        await new Promise((resolve) => setTimeout(resolve, 100));

        const readers = devices.listReaders();

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

    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            devices.stop();
            ctx.error('Timeout waiting for card');
            resolve(1);
        }, timeout);

        const handleCardInserted = (event: CardInsertedEvent) => {
            // Filter by reader name if specified
            if (ctx.readerName && event.reader.name !== ctx.readerName) {
                return; // Ignore cards in other readers
            }

            clearTimeout(timeoutId);
            devices.stop();

            ctx.output(`Card inserted in: ${event.reader.name}`);
            if (event.card.atr) {
                ctx.output(`ATR: ${event.card.atr.toString('hex')}`);
            }

            resolve(0);
        };

        devices.on('card-inserted', handleCardInserted as (event: unknown) => void);

        ctx.output('Waiting for card...');
        if (ctx.readerName) {
            ctx.output(`Using reader: ${ctx.readerName}`);
        }

        devices.start();
    });
}

/**
 * Create a Devices instance (lazy import to avoid loading native module in tests)
 */
async function createDevices(): Promise<DevicesLike> {
    const { Devices } = await import('smartcard');
    return new Devices() as DevicesLike;
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
        ctx.error('Invalid AID format. AID must be 5-16 bytes in hex (e.g., a0000000041010)');
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
}

/**
 * Read applications from Payment System Environment
 * This is a shared helper used by listApps, cardInfo, and dumpCard.
 * Uses EmvApplication.discoverApplications() for app discovery, with additional
 * record reading for dump functionality.
 */
export async function readPseApplications(options: CommandOptions = {}): Promise<PseReadResult> {
    const emv = options.emv;
    if (!emv?.discoverApplications) {
        // Fallback for mocks without discoverApplications
        if (!emv?.selectPse || !emv.readRecord) {
            return { pseOk: false, pseBuffer: Buffer.alloc(0), sfi: 1, apps: [], records: [] };
        }

        // Use the old implementation for backward compatibility with tests
        const pseResponse = await emv.selectPse();
        if (!pseResponse.isOk()) {
            return { pseOk: false, pseBuffer: Buffer.alloc(0), sfi: 1, apps: [], records: [] };
        }

        const sfiData = findTagInBuffer(pseResponse.buffer, 0x88);
        const sfi = sfiData?.[0] ?? 1;

        const apps: PseAppInfo[] = [];
        const records: PseRecordData[] = [];

        for (let record = 1; record <= 10; record++) {
            const response = await emv.readRecord(sfi, record);
            if (!response.isOk()) break;

            records.push({
                sfi,
                record,
                data: response.buffer.toString('hex'),
            });

            const aid = findTagInBuffer(response.buffer, 0x4f);
            if (aid) {
                const label = findTagInBuffer(response.buffer, 0x50);
                const priority = findTagInBuffer(response.buffer, 0x87);

                apps.push({
                    aid: aid.toString('hex'),
                    label: label?.toString('ascii'),
                    priority: priority?.[0],
                });
            }
        }

        return { pseOk: true, pseBuffer: pseResponse.buffer, sfi, apps, records };
    }

    // Use the new discoverApplications method
    const result = await emv.discoverApplications();
    if (!result.success) {
        return { pseOk: false, pseBuffer: Buffer.alloc(0), sfi: 1, apps: [], records: [] };
    }

    // Convert DiscoveredApp to PseAppInfo (they have the same shape)
    const apps: PseAppInfo[] = result.apps.map((app: DiscoveredApp) => ({
        aid: app.aid,
        label: app.label,
        priority: app.priority,
    }));

    // For dump functionality, we need to re-read records to get raw data
    // The discoverApplications method doesn't expose raw records
    const records: PseRecordData[] = [];
    if (emv.readRecord) {
        for (let record = 1; record <= 10; record++) {
            const response = await emv.readRecord(result.sfi, record);
            if (!response.isOk()) break;
            records.push({
                sfi: result.sfi,
                record,
                data: response.buffer.toString('hex'),
            });
        }
    }

    return {
        pseOk: true,
        pseBuffer: result.pseBuffer ?? Buffer.alloc(0),
        sfi: result.sfi,
        apps,
        records,
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
    // Validate SFI
    if (!Number.isInteger(sfi) || sfi < 1 || sfi > 30) {
        ctx.error('SFI must be an integer between 1 and 30');
        return 1;
    }

    // Validate record number
    if (!Number.isInteger(record) || record < 0 || record > 255) {
        ctx.error('Record number must be an integer between 0 and 255');
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
        ctx.error('Invalid tag format. Tag must be 1-2 bytes in hex (e.g., 9f17)');
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
    // Validate PIN format
    if (!/^\d{4,12}$/.test(pin)) {
        ctx.error('Invalid PIN format. PIN must be 4-12 digits.');
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
            ctx.output('PSE not available');
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
            ctx.output('PSE Response:');
            ctx.output(`  ${pseHex}`);
            ctx.output('');

            ctx.output(`Reading SFI ${String(pseResult.sfi)}:`);
            for (const rec of pseResult.records) {
                ctx.output(`  Record ${String(rec.record)}: ${rec.data}`);
            }
        } else {
            ctx.output('PSE selection failed');
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
