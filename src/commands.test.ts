import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { listReaders, waitForCard, type CommandContext } from './commands.js';

function createMockContext(): { ctx: CommandContext; outputs: string[]; errors: string[] } {
    const outputs: string[] = [];
    const errors: string[] = [];
    return {
        ctx: {
            output: (msg: string) => outputs.push(msg),
            error: (msg: string) => errors.push(msg),
            readerName: undefined,
            format: undefined,
            verbose: undefined,
        },
        outputs,
        errors,
    };
}

describe('Commands', () => {
    describe('listReaders', () => {
        it('should return empty array when no readers available', async () => {
            const { ctx, outputs } = createMockContext();

            const mockDevices = {
                listReaders: () => [],
                start: mock.fn(),
                stop: mock.fn(),
                on: mock.fn(),
                once: mock.fn(),
            };

            const result = await listReaders(ctx, { devices: mockDevices });
            assert.strictEqual(result, 0);
            assert.strictEqual(outputs.length, 1);
            assert.ok(outputs[0]?.includes('No readers'));
        });

        it('should list available readers', async () => {
            const { ctx, outputs } = createMockContext();

            const mockDevices = {
                listReaders: () => [
                    { name: 'Reader 1', state: 0, atr: null },
                    { name: 'Reader 2', state: 0, atr: null },
                ],
                start: mock.fn(),
                stop: mock.fn(),
                on: mock.fn(),
                once: mock.fn(),
            };

            const result = await listReaders(ctx, { devices: mockDevices });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('Reader 1')));
            assert.ok(outputs.some((o) => o.includes('Reader 2')));
        });

        it('should indicate when a card is present', async () => {
            const { ctx, outputs } = createMockContext();

            const mockDevices = {
                listReaders: () => [
                    { name: 'Reader 1', state: 0x20, atr: Buffer.from([0x3b, 0x90]) }, // SCARD_STATE_PRESENT = 0x20
                ],
                start: mock.fn(),
                stop: mock.fn(),
                on: mock.fn(),
                once: mock.fn(),
            };

            const result = await listReaders(ctx, { devices: mockDevices });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('card present')));
        });
    });

    describe('waitForCard', () => {
        it('should wait for card and return ATR', async () => {
            const { ctx, outputs } = createMockContext();

            const mockCard = {
                atr: Buffer.from([0x3b, 0x90, 0x00]),
                protocol: 1,
                connected: true,
                transmit: mock.fn(),
            };

            type EventHandler = (event: { reader: { name: string }; card: typeof mockCard }) => void;
            let cardInsertedHandler: EventHandler | undefined;

            const mockDevices = {
                listReaders: () => [{ name: 'Test Reader', state: 0, atr: null }],
                start: mock.fn(() => {
                    // Simulate card insertion after start
                    setTimeout(() => {
                        if (cardInsertedHandler) {
                            cardInsertedHandler({ reader: { name: 'Test Reader' }, card: mockCard });
                        }
                    }, 10);
                }),
                stop: mock.fn(),
                on: mock.fn((event: string, handler: EventHandler) => {
                    if (event === 'card-inserted') {
                        cardInsertedHandler = handler;
                    }
                }),
                once: mock.fn(),
            };

            const result = await waitForCard(ctx, { devices: mockDevices, timeout: 1000 });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('3b9000')));
        });

        it('should timeout when no card inserted', async () => {
            const { ctx, errors } = createMockContext();

            const mockDevices = {
                listReaders: () => [{ name: 'Test Reader', state: 0, atr: null }],
                start: mock.fn(),
                stop: mock.fn(),
                on: mock.fn(),
                once: mock.fn(),
            };

            const result = await waitForCard(ctx, { devices: mockDevices, timeout: 50 });
            assert.strictEqual(result, 1);
            assert.ok(errors[0]?.includes('Timeout'));
        });

        it('should filter by reader name when specified', async () => {
            const { ctx, outputs } = createMockContext();
            ctx.readerName = 'Specific Reader';

            const mockCard = {
                atr: Buffer.from([0x3b, 0x90]),
                protocol: 1,
                connected: true,
                transmit: mock.fn(),
            };

            type EventHandler = (event: { reader: { name: string }; card: typeof mockCard }) => void;
            let cardInsertedHandler: EventHandler | undefined;

            const mockDevices = {
                listReaders: () => [
                    { name: 'Other Reader', state: 0, atr: null },
                    { name: 'Specific Reader', state: 0, atr: null },
                ],
                start: mock.fn(() => {
                    setTimeout(() => {
                        if (cardInsertedHandler) {
                            // First emit for wrong reader (should be ignored)
                            cardInsertedHandler({ reader: { name: 'Other Reader' }, card: mockCard });
                            // Then emit for correct reader
                            cardInsertedHandler({ reader: { name: 'Specific Reader' }, card: mockCard });
                        }
                    }, 10);
                }),
                stop: mock.fn(),
                on: mock.fn((event: string, handler: EventHandler) => {
                    if (event === 'card-inserted') {
                        cardInsertedHandler = handler;
                    }
                }),
                once: mock.fn(),
            };

            const result = await waitForCard(ctx, { devices: mockDevices, timeout: 1000 });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('Specific Reader')));
        });
    });
});
