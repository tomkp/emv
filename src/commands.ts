/**
 * CLI command implementations
 */

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
 * Options for commands (for dependency injection in tests)
 */
export interface CommandOptions {
    devices?: DevicesLike;
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
