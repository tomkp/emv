import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import {
    listReaders,
    waitForCard,
    selectPse,
    selectApp,
    listApps,
    readRecord,
    getData,
    cardInfo,
    dumpCard,
    verifyPin,
    processShellCommand,
    readPseApplications,
    withCard,
    type CommandContext,
} from './commands.js';

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

            type EventHandler = (event: {
                reader: { name: string };
                card: typeof mockCard;
            }) => void;
            let cardInsertedHandler: EventHandler | undefined;

            const mockDevices = {
                listReaders: () => [{ name: 'Test Reader', state: 0, atr: null }],
                start: mock.fn(() => {
                    // Simulate card insertion after start
                    setTimeout(() => {
                        if (cardInsertedHandler) {
                            cardInsertedHandler({
                                reader: { name: 'Test Reader' },
                                card: mockCard,
                            });
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

            type EventHandler = (event: {
                reader: { name: string };
                card: typeof mockCard;
            }) => void;
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
                            cardInsertedHandler({
                                reader: { name: 'Other Reader' },
                                card: mockCard,
                            });
                            // Then emit for correct reader
                            cardInsertedHandler({
                                reader: { name: 'Specific Reader' },
                                card: mockCard,
                            });
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

    describe('selectPse', () => {
        it('should select PSE and show response', async () => {
            const { ctx, outputs } = createMockContext();

            // PSE response with SFI
            const pseResponse = Buffer.from([
                0x6f,
                0x1a, // FCI Template
                0x84,
                0x0e,
                0x31,
                0x50,
                0x41,
                0x59,
                0x2e,
                0x53,
                0x59,
                0x53,
                0x2e,
                0x44,
                0x44,
                0x46,
                0x30,
                0x31, // DF Name
                0xa5,
                0x08, // FCI Proprietary Template
                0x88,
                0x01,
                0x01, // SFI
                0x5f,
                0x2d,
                0x02,
                0x65,
                0x6e, // Language preference
                0x90,
                0x00, // SW
            ]);

            const mockEmv = {
                selectPse: mock.fn(() =>
                    Promise.resolve({
                        buffer: pseResponse.subarray(0, -2),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
            };

            const result = await selectPse(ctx, { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('PSE selected')));
        });

        it('should show error when PSE selection fails', async () => {
            const { ctx, errors } = createMockContext();

            const mockEmv = {
                selectPse: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.alloc(0),
                        sw1: 0x6a,
                        sw2: 0x82,
                        isOk: () => false,
                    })
                ),
            };

            const result = await selectPse(ctx, { emv: mockEmv });
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('failed')));
        });
    });

    describe('selectApp', () => {
        it('should select application by AID', async () => {
            const { ctx, outputs } = createMockContext();

            const mockEmv = {
                selectApplication: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([
                            0x6f, 0x10, 0x84, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10,
                        ]),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
            };

            const result = await selectApp(ctx, 'a0000000041010', { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('Application selected')));
        });

        it('should show error for invalid AID format', async () => {
            const { ctx, errors } = createMockContext();

            const result = await selectApp(ctx, 'invalid', {});
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('Invalid AID')));
        });

        it('should show error when application not found', async () => {
            const { ctx, errors } = createMockContext();

            const mockEmv = {
                selectApplication: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.alloc(0),
                        sw1: 0x6a,
                        sw2: 0x82,
                        isOk: () => false,
                    })
                ),
            };

            const result = await selectApp(ctx, 'a0000000041010', { emv: mockEmv });
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('failed')));
        });
    });

    describe('listApps', () => {
        it('should list applications from PSE', async () => {
            const { ctx, outputs } = createMockContext();

            // PSE response with SFI
            const pseResponse = {
                buffer: Buffer.from([
                    0x6f, 0x1a, 0x84, 0x0e, 0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e,
                    0x44, 0x44, 0x46, 0x30, 0x31, 0xa5, 0x08, 0x88, 0x01, 0x01, 0x5f, 0x2d, 0x02,
                    0x65, 0x6e,
                ]),
                sw1: 0x90,
                sw2: 0x00,
                isOk: () => true,
            };

            // Record with AID
            const recordResponse = {
                buffer: Buffer.from([
                    0x70,
                    0x1a, // Record template
                    0x61,
                    0x18, // Application template
                    0x4f,
                    0x07,
                    0xa0,
                    0x00,
                    0x00,
                    0x00,
                    0x04,
                    0x10,
                    0x10, // AID
                    0x50,
                    0x0a,
                    0x4d,
                    0x61,
                    0x73,
                    0x74,
                    0x65,
                    0x72,
                    0x43,
                    0x61,
                    0x72,
                    0x64, // Label
                    0x87,
                    0x01,
                    0x01, // Priority
                ]),
                sw1: 0x90,
                sw2: 0x00,
                isOk: () => true,
            };

            // Empty record (end of list)
            const emptyResponse = {
                buffer: Buffer.alloc(0),
                sw1: 0x6a,
                sw2: 0x83,
                isOk: () => false,
            };

            let readRecordCalls = 0;
            const mockEmv = {
                selectPse: mock.fn(() => Promise.resolve(pseResponse)),
                readRecord: mock.fn(() => {
                    readRecordCalls++;
                    if (readRecordCalls === 1) {
                        return Promise.resolve(recordResponse);
                    }
                    return Promise.resolve(emptyResponse);
                }),
            };

            const result = await listApps(ctx, { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('a0000000041010')));
        });

        it('should show message when no applications found', async () => {
            const { ctx, outputs } = createMockContext();

            const pseResponse = {
                buffer: Buffer.from([
                    0x6f, 0x1a, 0x84, 0x0e, 0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e,
                    0x44, 0x44, 0x46, 0x30, 0x31, 0xa5, 0x08, 0x88, 0x01, 0x01, 0x5f, 0x2d, 0x02,
                    0x65, 0x6e,
                ]),
                sw1: 0x90,
                sw2: 0x00,
                isOk: () => true,
            };

            const emptyResponse = {
                buffer: Buffer.alloc(0),
                sw1: 0x6a,
                sw2: 0x83,
                isOk: () => false,
            };

            const mockEmv = {
                selectPse: mock.fn(() => Promise.resolve(pseResponse)),
                readRecord: mock.fn(() => Promise.resolve(emptyResponse)),
            };

            const result = await listApps(ctx, { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('No applications')));
        });
    });

    describe('readRecord', () => {
        it('should read a record and display data', async () => {
            const { ctx, outputs } = createMockContext();

            const mockEmv = {
                readRecord: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([
                            0x70, 0x08, 0x5a, 0x06, 0x12, 0x34, 0x56, 0x78, 0x90, 0x12,
                        ]),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
            };

            const result = await readRecord(ctx, 1, 1, { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('Record 1')));
        });

        it('should show error when record not found', async () => {
            const { ctx, errors } = createMockContext();

            const mockEmv = {
                readRecord: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.alloc(0),
                        sw1: 0x6a,
                        sw2: 0x83,
                        isOk: () => false,
                    })
                ),
            };

            const result = await readRecord(ctx, 1, 1, { emv: mockEmv });
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('failed')));
        });

        it('should validate SFI range', async () => {
            const { ctx, errors } = createMockContext();

            const result = await readRecord(ctx, 0, 1, {});
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('SFI')));
        });

        it('should validate record number range', async () => {
            const { ctx, errors } = createMockContext();

            const result = await readRecord(ctx, 1, 300, {});
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('Record')));
        });
    });

    describe('getData', () => {
        it('should get data by tag and display result', async () => {
            const { ctx, outputs } = createMockContext();

            // PIN try counter response: 9F17 01 03
            const mockEmv = {
                getData: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([0x9f, 0x17, 0x01, 0x03]),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
            };

            const result = await getData(ctx, '9f17', { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('9f17')));
        });

        it('should show error when data not found', async () => {
            const { ctx, errors } = createMockContext();

            const mockEmv = {
                getData: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.alloc(0),
                        sw1: 0x6a,
                        sw2: 0x88,
                        isOk: () => false,
                    })
                ),
            };

            const result = await getData(ctx, '9f17', { emv: mockEmv });
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('failed')));
        });

        it('should validate tag format', async () => {
            const { ctx, errors } = createMockContext();

            const result = await getData(ctx, 'invalid', {});
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('Invalid tag')));
        });

        it('should accept 1-byte tags', async () => {
            const { ctx, outputs } = createMockContext();

            const mockEmv = {
                getData: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([0x9c, 0x01, 0x00]),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
            };

            const result = await getData(ctx, '9c', { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('9c')));
        });
    });

    describe('cardInfo', () => {
        it('should display ATR and applications', async () => {
            const { ctx, outputs } = createMockContext();
            ctx.format = 'text';

            const pseResponse = {
                buffer: Buffer.from([
                    0x6f, 0x1a, 0x84, 0x0e, 0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e,
                    0x44, 0x44, 0x46, 0x30, 0x31, 0xa5, 0x08, 0x88, 0x01, 0x01, 0x5f, 0x2d, 0x02,
                    0x65, 0x6e,
                ]),
                sw1: 0x90,
                sw2: 0x00,
                isOk: () => true,
            };

            const recordResponse = {
                buffer: Buffer.from([
                    0x70, 0x1a, 0x61, 0x18, 0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10,
                    0x50, 0x0a, 0x4d, 0x61, 0x73, 0x74, 0x65, 0x72, 0x43, 0x61, 0x72, 0x64, 0x87,
                    0x01, 0x01,
                ]),
                sw1: 0x90,
                sw2: 0x00,
                isOk: () => true,
            };

            const emptyResponse = {
                buffer: Buffer.alloc(0),
                sw1: 0x6a,
                sw2: 0x83,
                isOk: () => false,
            };

            let readRecordCalls = 0;
            const mockEmv = {
                getAtr: () => '3b9000',
                getReaderName: () => 'Test Reader',
                selectPse: mock.fn(() => Promise.resolve(pseResponse)),
                readRecord: mock.fn(() => {
                    readRecordCalls++;
                    if (readRecordCalls === 1) {
                        return Promise.resolve(recordResponse);
                    }
                    return Promise.resolve(emptyResponse);
                }),
            };

            const result = await cardInfo(ctx, { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('3b9000')));
            assert.ok(outputs.some((o) => o.includes('Test Reader')));
        });

        it('should output JSON when format is json', async () => {
            const { ctx, outputs } = createMockContext();
            ctx.format = 'json';

            const pseResponse = {
                buffer: Buffer.from([
                    0x6f, 0x1a, 0x84, 0x0e, 0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e,
                    0x44, 0x44, 0x46, 0x30, 0x31, 0xa5, 0x08, 0x88, 0x01, 0x01, 0x5f, 0x2d, 0x02,
                    0x65, 0x6e,
                ]),
                sw1: 0x90,
                sw2: 0x00,
                isOk: () => true,
            };

            const recordResponse = {
                buffer: Buffer.from([
                    0x70, 0x1a, 0x61, 0x18, 0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10,
                    0x50, 0x0a, 0x4d, 0x61, 0x73, 0x74, 0x65, 0x72, 0x43, 0x61, 0x72, 0x64, 0x87,
                    0x01, 0x01,
                ]),
                sw1: 0x90,
                sw2: 0x00,
                isOk: () => true,
            };

            const emptyResponse = {
                buffer: Buffer.alloc(0),
                sw1: 0x6a,
                sw2: 0x83,
                isOk: () => false,
            };

            let readRecordCalls = 0;
            const mockEmv = {
                getAtr: () => '3b9000',
                getReaderName: () => 'Test Reader',
                selectPse: mock.fn(() => Promise.resolve(pseResponse)),
                readRecord: mock.fn(() => {
                    readRecordCalls++;
                    if (readRecordCalls === 1) {
                        return Promise.resolve(recordResponse);
                    }
                    return Promise.resolve(emptyResponse);
                }),
            };

            const result = await cardInfo(ctx, { emv: mockEmv });
            assert.strictEqual(result, 0);
            // Should be valid JSON
            const json = JSON.parse(outputs[0] ?? '') as { atr: string };
            assert.strictEqual(json.atr, '3b9000');
        });
    });

    describe('dumpCard', () => {
        it('should dump all records', async () => {
            const { ctx, outputs } = createMockContext();

            const pseResponse = {
                buffer: Buffer.from([
                    0x6f, 0x1a, 0x84, 0x0e, 0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e,
                    0x44, 0x44, 0x46, 0x30, 0x31, 0xa5, 0x08, 0x88, 0x01, 0x01, 0x5f, 0x2d, 0x02,
                    0x65, 0x6e,
                ]),
                sw1: 0x90,
                sw2: 0x00,
                isOk: () => true,
            };

            const recordResponse = {
                buffer: Buffer.from([0x70, 0x04, 0x5a, 0x02, 0x12, 0x34]),
                sw1: 0x90,
                sw2: 0x00,
                isOk: () => true,
            };

            const emptyResponse = {
                buffer: Buffer.alloc(0),
                sw1: 0x6a,
                sw2: 0x83,
                isOk: () => false,
            };

            let readRecordCalls = 0;
            const mockEmv = {
                getAtr: () => '3b9000',
                selectPse: mock.fn(() => Promise.resolve(pseResponse)),
                readRecord: mock.fn(() => {
                    readRecordCalls++;
                    if (readRecordCalls <= 2) {
                        return Promise.resolve(recordResponse);
                    }
                    return Promise.resolve(emptyResponse);
                }),
            };

            const result = await dumpCard(ctx, { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('SFI')));
        });
    });

    describe('processShellCommand', () => {
        it('should return help text for help command', async () => {
            const { ctx, outputs } = createMockContext();

            const result = await processShellCommand(ctx, 'help', {});
            assert.strictEqual(result.action, 'continue');
            assert.ok(outputs.some((o) => o.includes('Commands')));
        });

        it('should return exit action for quit command', async () => {
            const { ctx } = createMockContext();

            const result = await processShellCommand(ctx, 'quit', {});
            assert.strictEqual(result.action, 'exit');
        });

        it('should return exit action for exit command', async () => {
            const { ctx } = createMockContext();

            const result = await processShellCommand(ctx, 'exit', {});
            assert.strictEqual(result.action, 'exit');
        });

        it('should handle select-pse command', async () => {
            const { ctx, outputs } = createMockContext();

            const mockEmv = {
                selectPse: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([0x6f, 0x10]),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
            };

            const result = await processShellCommand(ctx, 'select-pse', { emv: mockEmv });
            assert.strictEqual(result.action, 'continue');
            assert.ok(outputs.some((o) => o.includes('PSE selected')));
        });

        it('should handle select-app command with AID', async () => {
            const { ctx, outputs } = createMockContext();

            const mockEmv = {
                selectApplication: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([0x6f, 0x10]),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
            };

            const result = await processShellCommand(ctx, 'select-app a0000000041010', {
                emv: mockEmv,
            });
            assert.strictEqual(result.action, 'continue');
            assert.ok(outputs.some((o) => o.includes('Application selected')));
        });

        it('should handle read-record command', async () => {
            const { ctx, outputs } = createMockContext();

            const mockEmv = {
                readRecord: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([0x70, 0x04]),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
            };

            const result = await processShellCommand(ctx, 'read-record 1 1', { emv: mockEmv });
            assert.strictEqual(result.action, 'continue');
            assert.ok(outputs.some((o) => o.includes('Record 1')));
        });

        it('should show error for unknown command', async () => {
            const { ctx, errors } = createMockContext();

            const result = await processShellCommand(ctx, 'unknown-cmd', {});
            assert.strictEqual(result.action, 'continue');
            assert.ok(errors.some((o) => o.includes('Unknown command')));
        });

        it('should ignore empty input', async () => {
            const { ctx, outputs, errors } = createMockContext();

            const result = await processShellCommand(ctx, '', {});
            assert.strictEqual(result.action, 'continue');
            assert.strictEqual(outputs.length, 0);
            assert.strictEqual(errors.length, 0);
        });
    });

    describe('verifyPin', () => {
        it('should verify PIN successfully', async () => {
            const { ctx, outputs } = createMockContext();

            const mockEmv = {
                verifyPin: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([]),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
            };

            const result = await verifyPin(ctx, '1234', { emv: mockEmv });
            assert.strictEqual(result, 0);
            assert.ok(outputs.some((o) => o.includes('verified')));
        });

        it('should report wrong PIN with remaining attempts', async () => {
            const { ctx, errors } = createMockContext();

            const mockEmv = {
                verifyPin: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([]),
                        sw1: 0x63,
                        sw2: 0xc2, // 2 attempts remaining
                        isOk: () => false,
                    })
                ),
            };

            const result = await verifyPin(ctx, '1234', { emv: mockEmv });
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('Wrong PIN')));
            assert.ok(errors.some((o) => o.includes('2')));
        });

        it('should report PIN blocked', async () => {
            const { ctx, errors } = createMockContext();

            const mockEmv = {
                verifyPin: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([]),
                        sw1: 0x69,
                        sw2: 0x83,
                        isOk: () => false,
                    })
                ),
            };

            const result = await verifyPin(ctx, '1234', { emv: mockEmv });
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('blocked')));
        });

        it('should validate PIN format', async () => {
            const { ctx, errors } = createMockContext();

            const result = await verifyPin(ctx, '12', { emv: {} });
            assert.strictEqual(result, 1);
            assert.ok(errors.some((o) => o.includes('4-12 digits')));
        });
    });

    describe('readPseApplications', () => {
        it('should return applications from PSE records', async () => {
            const mockEmv = {
                selectPse: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([0x6f, 0x05, 0x88, 0x01, 0x01, 0x90, 0x00]),
                        sw1: 0x90,
                        sw2: 0x00,
                        isOk: () => true,
                    })
                ),
                readRecord: mock.fn((_sfi: number, record: number) => {
                    if (record === 1) {
                        // Record with AID and label
                        return Promise.resolve({
                            buffer: Buffer.from([
                                0x70, 0x12, 0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10,
                                0x50, 0x04, 0x56, 0x49, 0x53, 0x41, 0x87, 0x01, 0x01,
                            ]),
                            sw1: 0x90,
                            sw2: 0x00,
                            isOk: () => true,
                        });
                    }
                    return Promise.resolve({
                        buffer: Buffer.from([]),
                        sw1: 0x6a,
                        sw2: 0x83,
                        isOk: () => false,
                    });
                }),
            };

            const result = await readPseApplications({ emv: mockEmv });
            assert.strictEqual(result.pseOk, true);
            assert.strictEqual(result.apps.length, 1);
            assert.strictEqual(result.apps[0]?.aid, 'a0000000041010');
            assert.strictEqual(result.apps[0]?.label, 'VISA');
            assert.strictEqual(result.records.length, 1);
            assert.strictEqual(result.records[0]?.record, 1);
        });

        it('should return empty apps when PSE fails', async () => {
            const mockEmv = {
                selectPse: mock.fn(() =>
                    Promise.resolve({
                        buffer: Buffer.from([]),
                        sw1: 0x6a,
                        sw2: 0x82,
                        isOk: () => false,
                    })
                ),
            };

            const result = await readPseApplications({ emv: mockEmv });
            assert.strictEqual(result.pseOk, false);
            assert.strictEqual(result.apps.length, 0);
        });

        it('should return empty apps when emv is not available', async () => {
            const result = await readPseApplications({});
            assert.strictEqual(result.pseOk, false);
            assert.strictEqual(result.apps.length, 0);
        });
    });
});

/**
 * Devices whose start() emits the given events, in order, once handlers are registered
 */
function devicesEmitting(events: [string, unknown][], readers: { name: string }[] = []) {
    const handlers = new Map<string, ((event: unknown) => void)[]>();
    let stopped = false;
    return {
        devices: {
            listReaders: () => readers.map((r) => ({ name: r.name, state: 0, atr: null })),
            start: () => {
                setTimeout(() => {
                    for (const [name, event] of events) {
                        handlers.get(name)?.forEach((handler) => {
                            handler(event);
                        });
                    }
                }, 0);
            },
            stop: () => {
                stopped = true;
            },
            on: (name: string, handler: (event: unknown) => void) => {
                handlers.set(name, [...(handlers.get(name) ?? []), handler]);
            },
            once: () => {},
        },
        isStopped: () => stopped,
    };
}

function cardAnswering(respond: (apdu: Buffer) => Buffer) {
    return {
        atr: Buffer.from([0x3b, 0x00]),
        protocol: 1,
        connected: true,
        transmit: async (apdu: Buffer | number[]) => respond(Buffer.from(apdu)),
    };
}

function response(hex: string) {
    const buffer = Buffer.from(hex, 'hex');
    const sw1 = buffer[buffer.length - 2] ?? 0;
    const sw2 = buffer[buffer.length - 1] ?? 0;
    return {
        buffer: buffer.subarray(0, buffer.length - 2),
        sw1,
        sw2,
        isOk: () => sw1 === 0x90 && sw2 === 0x00,
    };
}

describe('withCard', () => {
    it('should run the command with an EmvApplication for the inserted card', async () => {
        const { ctx } = createMockContext();
        const card = cardAnswering(() => Buffer.from([0x90, 0x00]));
        const { devices, isStopped } = devicesEmitting([
            ['card-inserted', { reader: { name: 'Reader A', state: 0x20, atr: card.atr }, card }],
        ]);

        let readerName: string | undefined;
        const result = await withCard(
            ctx,
            async (emv) => {
                readerName = emv.getReaderName?.();
                return 7;
            },
            { devices, timeout: 1000 }
        );

        assert.strictEqual(result, 7);
        assert.strictEqual(readerName, 'Reader A');
        assert.ok(isStopped());
    });

    it('should only use a card in the reader given with --reader', async () => {
        const { ctx } = createMockContext();
        ctx.readerName = 'Reader B';
        const card = cardAnswering(() => Buffer.from([0x90, 0x00]));
        const { devices } = devicesEmitting([
            ['card-inserted', { reader: { name: 'Reader A', state: 0x20, atr: null }, card }],
            ['card-inserted', { reader: { name: 'Reader B', state: 0x20, atr: null }, card }],
        ]);

        let readerName: string | undefined;
        await withCard(
            ctx,
            async (emv) => {
                readerName = emv.getReaderName?.();
                return 0;
            },
            { devices, timeout: 1000 }
        );

        assert.strictEqual(readerName, 'Reader B');
    });

    it('should fail cleanly when PC/SC reports an error', async () => {
        const { ctx, errors } = createMockContext();
        const { devices, isStopped } = devicesEmitting([
            ['error', new Error('SCardEstablishContext failed')],
        ]);

        let ran = false;
        const result = await withCard(
            ctx,
            async () => {
                ran = true;
                return 0;
            },
            { devices, timeout: 1000 }
        );

        assert.strictEqual(result, 1);
        assert.strictEqual(ran, false);
        assert.ok(errors.some((e) => e.includes('SCardEstablishContext failed')));
        assert.ok(isStopped());
    });

    it('should keep waiting for the requested reader when another reader reports an error', async () => {
        const { ctx, errors } = createMockContext();
        ctx.readerName = 'Reader B';
        const card = cardAnswering(() => Buffer.from([0x90, 0x00]));
        const { devices } = devicesEmitting(
            [
                ['error', new Error('Card is unresponsive')],
                ['card-inserted', { reader: { name: 'Reader B', state: 0x20, atr: null }, card }],
            ],
            [{ name: 'Reader A' }, { name: 'Reader B' }]
        );

        const result = await withCard(ctx, async () => 0, { devices, timeout: 1000 });

        assert.strictEqual(result, 0);
        assert.ok(errors.some((e) => e.includes('Card is unresponsive')));
    });

    it('should time out when no card is inserted', async () => {
        const { ctx, errors } = createMockContext();
        const { devices } = devicesEmitting([]);

        const result = await withCard(ctx, async () => 0, { devices, timeout: 20 });

        assert.strictEqual(result, 1);
        assert.ok(errors.some((e) => e.includes('Timeout')));
    });
});

describe('PC/SC errors', () => {
    it('waitForCard should fail cleanly when PC/SC reports an error', async () => {
        const { ctx, errors } = createMockContext();
        const { devices } = devicesEmitting([['error', new Error('Card is unresponsive')]]);

        const result = await waitForCard(ctx, { devices, timeout: 1000 });

        assert.strictEqual(result, 1);
        assert.ok(errors.some((e) => e.includes('Card is unresponsive')));
    });

    it('listReaders should report the PC/SC error when there are no readers', async () => {
        const { ctx, errors } = createMockContext();
        const { devices } = devicesEmitting([['error', new Error('No PC/SC service')]]);

        const result = await listReaders(ctx, { devices });

        assert.strictEqual(result, 1);
        assert.ok(errors.some((e) => e.includes('No PC/SC service')));
    });

    it('listReaders should still list readers when a card reports an error', async () => {
        const { ctx, outputs, errors } = createMockContext();
        const { devices } = devicesEmitting(
            [['error', new Error('Card is unresponsive')]],
            [{ name: 'Reader A' }]
        );

        const result = await listReaders(ctx, { devices });

        assert.strictEqual(result, 0);
        assert.deepStrictEqual(errors, []);
        assert.ok(outputs.some((o) => o.includes('Reader A')));
    });
});

describe('Application discovery in commands', () => {
    const ppseResponse =
        // 6F [84 '2PAY.SYS.DDF01', A5 [BF0C [61 [4F A0000000041010, 87 01]]]]
        '6f23840e325041592e5359532e4444463031a511bf0c0e610c4f07a0000000041010870101' + '9000';

    it('should fall back to the PPSE when there is no PSE', async () => {
        const emv = {
            selectPse: async () => response('6a82'),
            selectPpse: async () => response(ppseResponse),
            readRecord: async () => response('6a83'),
        };

        const result = await readPseApplications({ emv });

        assert.strictEqual(result.pseOk, true);
        assert.strictEqual(result.source, 'ppse');
        assert.deepStrictEqual(
            result.apps.map((app) => app.aid),
            ['a0000000041010']
        );
    });

    it('should list every application in a PSE record', async () => {
        const emv = {
            selectPse: async () => response('6f05a503880101' + '9000'),
            readRecord: async (_sfi: number, record: number) =>
                record === 1
                    ? // 70 [61 [4F A0000000031010], 61 [4F A0000000041010]]
                      response(
                          '70166109' + '4f07a0000000031010' + '6109' + '4f07a0000000041010' + '9000'
                      )
                    : response('6a83'),
        };

        const result = await readPseApplications({ emv });

        assert.deepStrictEqual(
            result.apps.map((app) => app.aid),
            ['a0000000031010', 'a0000000041010']
        );
    });

    it('dump should show the PPSE response without PSE records', async () => {
        const { ctx, outputs } = createMockContext();
        const emv = {
            getAtr: () => '3b00',
            selectPse: async () => response('6a82'),
            selectPpse: async () => response(ppseResponse),
            readRecord: async () => response('6a83'),
        };

        const result = await dumpCard(ctx, { emv });

        assert.strictEqual(result, 0);
        assert.ok(outputs.includes('PPSE Response:'));
        assert.ok(!outputs.some((o) => o.startsWith('Reading SFI')));
    });
});
