#!/usr/bin/env node
/**
 * Interactive EMV CLI with a beautiful, modern UX
 * Inspired by Claude Code and OpenCode
 */

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useApp, useInput, useStdin } from 'ink';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Gradient from 'ink-gradient';
import { EmvApplication } from './emv-application.js';
import { format as formatTlv, findTagInBuffer } from './emv-tags.js';

// ============================================================================
// Types
// ============================================================================

interface ReaderInfo {
    name: string;
    state: number;
    atr: Buffer | null;
}

interface CardInfo {
    atr: Buffer | null;
    protocol: number;
    connected: boolean;
}

interface DevicesLike {
    listReaders(): ReaderInfo[];
    start(): void;
    stop(): void;
    on(event: string, handler: (event: unknown) => void): void;
    once(event: string, handler: (event: unknown) => void): void;
    off(event: string, handler: (event: unknown) => void): void;
    getCard(readerName: string): CardInfo | null;
}

interface CardInsertedEvent {
    reader: ReaderInfo;
    card: CardInfo;
}

interface AppInfo {
    aid: string;
    label: string | undefined;
    priority: number | undefined;
}

type Screen =
    | 'welcome'
    | 'readers'
    | 'waiting'
    | 'apps'
    | 'selected'
    | 'pin'
    | 'pin-result'
    | 'explore'
    | 'error';

// ============================================================================
// UI Components
// ============================================================================

const SCARD_STATE_PRESENT = 0x20;

function Header(): React.JSX.Element {
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Gradient name="rainbow">
                <Text bold>{'╔' + '═'.repeat(63) + '╗'}</Text>
            </Gradient>
            <Text color="cyan" bold>║{' '.repeat(63)}║</Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>███████╗███╗   ███╗██╗   ██╗</Text>
                </Gradient>
                <Text color="cyan">{' '.repeat(33)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>██╔════╝████╗ ████║██║   ██║</Text>
                </Gradient>
                <Text color="yellow">   Chip &amp; PIN Explorer</Text>
                <Text color="cyan">{' '.repeat(11)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>█████╗  ██╔████╔██║██║   ██║</Text>
                </Gradient>
                <Text color="yellow">   Interactive Mode</Text>
                <Text color="cyan">{' '.repeat(14)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>██╔══╝  ██║╚██╔╝██║╚██╗ ██╔╝</Text>
                </Gradient>
                <Text color="cyan">{' '.repeat(33)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>███████╗██║ ╚═╝ ██║ ╚████╔╝ </Text>
                </Gradient>
                <Text color="gray">   v2.0.0</Text>
                <Text color="cyan">{' '.repeat(24)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>╚══════╝╚═╝     ╚═╝  ╚═══╝  </Text>
                </Gradient>
                <Text color="cyan">{' '.repeat(33)}║</Text>
            </Text>
            <Text color="cyan" bold>║{' '.repeat(63)}║</Text>
            <Gradient name="rainbow">
                <Text bold>{'╚' + '═'.repeat(63) + '╝'}</Text>
            </Gradient>
        </Box>
    );
}

function StatusBar({ message, type = 'info' }: { message: string; type?: 'info' | 'success' | 'warning' | 'error' }): React.JSX.Element {
    const colors = {
        info: 'blue',
        success: 'green',
        warning: 'yellow',
        error: 'red',
    } as const;
    const icons = {
        info: 'ℹ',
        success: '✓',
        warning: '⚠',
        error: '✗',
    };

    return (
        <Box marginY={1} paddingX={2}>
            <Text color={colors[type]} bold>
                {icons[type]}{' '}
            </Text>
            <Text color={colors[type]}>{message}</Text>
        </Box>
    );
}

function LoadingSpinner({ message }: { message: string }): React.JSX.Element {
    return (
        <Box marginY={1} paddingX={2}>
            <Text color="cyan">
                <Spinner type="dots" />
            </Text>
            <Text color="cyan"> {message}</Text>
        </Box>
    );
}

function KeyHint({ keys, description }: { keys: string; description: string }): React.JSX.Element {
    return (
        <Box marginRight={2}>
            <Text color="yellow" bold>
                [{keys}]
            </Text>
            <Text color="gray"> {description}</Text>
        </Box>
    );
}

function Footer({ hints }: { hints: { keys: string; description: string }[] }): React.JSX.Element {
    return (
        <Box marginTop={1} paddingX={2} flexWrap="wrap">
            {hints.map((hint, index) => (
                <KeyHint key={index} keys={hint.keys} description={hint.description} />
            ))}
        </Box>
    );
}

function CardBox({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
    return (
        <Box flexDirection="column" marginY={1} paddingX={2}>
            <Box marginBottom={1}>
                <Text color="magenta" bold>
                    ┌─ {title} ─
                </Text>
            </Box>
            <Box flexDirection="column" paddingLeft={2}>
                {children}
            </Box>
        </Box>
    );
}

// ============================================================================
// Screen Components
// ============================================================================

interface WelcomeScreenProps {
    onContinue: () => void;
}

function WelcomeScreen({ onContinue }: WelcomeScreenProps): React.JSX.Element {
    useInput((input, key) => {
        if (key.return || input === ' ') {
            onContinue();
        }
    });

    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title="Welcome">
                <Text>
                    Welcome to the <Text color="cyan" bold>EMV Interactive Explorer</Text>!
                </Text>
                <Text> </Text>
                <Text color="gray">
                    This tool lets you explore EMV chip cards connected via PC/SC readers.
                </Text>
                <Text color="gray">
                    You can discover applications, read card data, and verify PINs.
                </Text>
            </CardBox>
            <Footer hints={[{ keys: 'Enter', description: 'Start' }, { keys: 'q', description: 'Quit' }]} />
        </Box>
    );
}

interface ReadersScreenProps {
    readers: ReaderInfo[];
    onSelect: (reader: ReaderInfo) => void;
    onRefresh: () => void;
    loading: boolean;
}

function ReadersScreen({ readers, onSelect, onRefresh, loading }: ReadersScreenProps): React.JSX.Element {
    useInput((input) => {
        if (input === 'r') {
            onRefresh();
        }
    });

    if (loading) {
        return (
            <Box flexDirection="column">
                <Header />
                <LoadingSpinner message="Scanning for card readers..." />
            </Box>
        );
    }

    if (readers.length === 0) {
        return (
            <Box flexDirection="column">
                <Header />
                <StatusBar message="No card readers found. Connect a reader and press 'r' to refresh." type="warning" />
                <Footer hints={[{ keys: 'r', description: 'Refresh' }, { keys: 'q', description: 'Quit' }]} />
            </Box>
        );
    }

    const items = readers.map((reader, index) => {
        const hasCard = (reader.state & SCARD_STATE_PRESENT) !== 0;
        const icon = hasCard ? '💳' : '📖';
        const status = hasCard ? ' (card present)' : '';
        return {
            key: `${reader.name}-${String(index)}`,
            label: `${icon}  ${reader.name}${status}`,
            value: reader,
        };
    });

    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title="Select a Card Reader">
                <SelectInput
                    items={items}
                    onSelect={(item) => { onSelect(item.value); }}
                    itemComponent={({ isSelected, label }) =>
                        isSelected ? (
                            <Text color="cyan" bold>
                                {'▸ '}
                                {label}
                            </Text>
                        ) : (
                            <Text>
                                {'  '}
                                {label}
                            </Text>
                        )
                    }
                />
            </CardBox>
            <Footer hints={[{ keys: '↑↓', description: 'Navigate' }, { keys: 'Enter', description: 'Select' }, { keys: 'r', description: 'Refresh' }, { keys: 'q', description: 'Quit' }]} />
        </Box>
    );
}

interface WaitingScreenProps {
    readerName: string;
}

function WaitingScreen({ readerName }: WaitingScreenProps): React.JSX.Element {
    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title="Waiting for Card">
                <Text color="gray">Reader: {readerName}</Text>
                <Text> </Text>
                <LoadingSpinner message="Insert a card to continue..." />
            </CardBox>
            <Footer hints={[{ keys: 'Esc', description: 'Back' }, { keys: 'q', description: 'Quit' }]} />
        </Box>
    );
}

interface AppsScreenProps {
    apps: AppInfo[];
    readerName: string;
    atr: string;
    onSelect: (app: AppInfo) => void;
    onBack: () => void;
    loading: boolean;
}

function AppsScreen({ apps, readerName, atr, onSelect, onBack, loading }: AppsScreenProps): React.JSX.Element {
    useInput((_input, key) => {
        if (key.escape) {
            onBack();
        }
    });

    if (loading) {
        return (
            <Box flexDirection="column">
                <Header />
                <LoadingSpinner message="Reading card applications..." />
            </Box>
        );
    }

    if (apps.length === 0) {
        return (
            <Box flexDirection="column">
                <Header />
                <CardBox title="Card Information">
                    <Text color="gray">Reader: {readerName}</Text>
                    <Text color="gray">ATR: {atr}</Text>
                </CardBox>
                <StatusBar message="No applications found on this card." type="warning" />
                <Footer hints={[{ keys: 'Esc', description: 'Back' }, { keys: 'q', description: 'Quit' }]} />
            </Box>
        );
    }

    const items = apps.map((app) => ({
        key: app.aid,
        label: `${app.label ?? 'Unknown'} (${app.aid})`,
        value: app,
    }));

    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title="Card Information">
                <Text color="gray">Reader: {readerName}</Text>
                <Text color="gray">ATR: {atr}</Text>
            </CardBox>
            <CardBox title="Select an Application">
                <SelectInput
                    items={items}
                    onSelect={(item) => { onSelect(item.value); }}
                    itemComponent={({ isSelected, label }) =>
                        isSelected ? (
                            <Text color="cyan" bold>
                                {'▸ '}
                                {label}
                            </Text>
                        ) : (
                            <Text>
                                {'  '}
                                {label}
                            </Text>
                        )
                    }
                />
            </CardBox>
            <Footer hints={[{ keys: '↑↓', description: 'Navigate' }, { keys: 'Enter', description: 'Select' }, { keys: 'Esc', description: 'Back' }, { keys: 'q', description: 'Quit' }]} />
        </Box>
    );
}

interface SelectedAppScreenProps {
    app: AppInfo;
    onVerifyPin: () => void;
    onExplore: () => void;
    onBack: () => void;
}

function SelectedAppScreen({ app, onVerifyPin, onExplore, onBack }: SelectedAppScreenProps): React.JSX.Element {
    const items = [
        { label: '🔐  Verify PIN', value: 'pin' },
        { label: '🔍  Explore Card Data', value: 'explore' },
        { label: '←   Back to Applications', value: 'back' },
    ];

    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title="Selected Application">
                <Text>
                    <Text color="cyan" bold>Name: </Text>
                    <Text>{app.label ?? 'Unknown'}</Text>
                </Text>
                <Text>
                    <Text color="cyan" bold>AID: </Text>
                    <Text color="yellow">{app.aid}</Text>
                </Text>
                {app.priority !== undefined && (
                    <Text>
                        <Text color="cyan" bold>Priority: </Text>
                        <Text>{app.priority}</Text>
                    </Text>
                )}
            </CardBox>
            <CardBox title="Actions">
                <SelectInput
                    items={items}
                    onSelect={(item) => {
                        switch (item.value) {
                            case 'pin':
                                onVerifyPin();
                                break;
                            case 'explore':
                                onExplore();
                                break;
                            case 'back':
                                onBack();
                                break;
                        }
                    }}
                    itemComponent={({ isSelected, label }) =>
                        isSelected ? (
                            <Text color="cyan" bold>
                                {'▸ '}
                                {label}
                            </Text>
                        ) : (
                            <Text>
                                {'  '}
                                {label}
                            </Text>
                        )
                    }
                />
            </CardBox>
            <Footer hints={[{ keys: '↑↓', description: 'Navigate' }, { keys: 'Enter', description: 'Select' }, { keys: 'q', description: 'Quit' }]} />
        </Box>
    );
}

interface PinScreenProps {
    onSubmit: (pin: string) => void;
    onBack: () => void;
    loading: boolean;
    attemptsLeft: number | undefined;
}

function PinScreen({ onSubmit, onBack, loading, attemptsLeft }: PinScreenProps): React.JSX.Element {
    const [pin, setPin] = useState('');
    const { isRawModeSupported } = useStdin();

    useInput((_input, key) => {
        if (key.escape) {
            onBack();
        }
    });

    const handleSubmit = useCallback((value: string) => {
        if (value.length >= 4 && value.length <= 12 && /^\d+$/.test(value)) {
            onSubmit(value);
        }
    }, [onSubmit]);

    if (loading) {
        return (
            <Box flexDirection="column">
                <Header />
                <LoadingSpinner message="Verifying PIN..." />
            </Box>
        );
    }

    const maskedPin = '•'.repeat(pin.length);

    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title="PIN Verification">
                {attemptsLeft !== undefined && attemptsLeft < 3 && (
                    <Box marginBottom={1}>
                        <Text color="yellow" bold>
                            ⚠ Warning: {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining!
                        </Text>
                    </Box>
                )}
                <Text color="gray">Enter your 4-12 digit PIN:</Text>
                <Text> </Text>
                <Box>
                    <Text color="cyan" bold>PIN: </Text>
                    {isRawModeSupported ? (
                        <Box>
                            <Text color="yellow">{maskedPin}</Text>
                            <TextInput
                                value={pin}
                                onChange={setPin}
                                onSubmit={handleSubmit}
                                mask="•"
                            />
                        </Box>
                    ) : (
                        <Text color="gray">(raw mode not supported)</Text>
                    )}
                </Box>
                <Text> </Text>
                <Text color="gray" dimColor>
                    PIN is sent in plaintext - use only with test cards!
                </Text>
            </CardBox>
            <Footer hints={[{ keys: 'Enter', description: 'Submit' }, { keys: 'Esc', description: 'Back' }]} />
        </Box>
    );
}

interface PinResultScreenProps {
    success: boolean;
    message: string;
    attemptsLeft: number | undefined;
    onContinue: () => void;
}

function PinResultScreen({ success, message, attemptsLeft, onContinue }: PinResultScreenProps): React.JSX.Element {
    useInput((input, key) => {
        if (key.return || input === ' ') {
            onContinue();
        }
    });

    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title="PIN Verification Result">
                {success ? (
                    <Box flexDirection="column">
                        <Text color="green" bold>
                            ✓ {message}
                        </Text>
                        <Text> </Text>
                        <Box>
                            <Text color="green">🎉 </Text>
                            <Gradient name="rainbow">
                                <Text bold>PIN Verified Successfully!</Text>
                            </Gradient>
                        </Box>
                    </Box>
                ) : (
                    <Box flexDirection="column">
                        <Text color="red" bold>
                            ✗ {message}
                        </Text>
                        {attemptsLeft !== undefined && (
                            <Text color="yellow">
                                Attempts remaining: {attemptsLeft}
                            </Text>
                        )}
                    </Box>
                )}
            </CardBox>
            <Footer hints={[{ keys: 'Enter', description: 'Continue' }]} />
        </Box>
    );
}

interface ExploreScreenProps {
    emv: EmvApplication;
    app: AppInfo;
    onBack: () => void;
}

function ExploreScreen({ emv, app, onBack }: ExploreScreenProps): React.JSX.Element {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{ tag: string; name: string; value: string }[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedAction, setSelectedAction] = useState<string | null>(null);

    useInput((_input, key) => {
        if (key.escape) {
            if (selectedAction) {
                setSelectedAction(null);
            } else {
                onBack();
            }
        }
    });

    const fetchData = useCallback(async (action: string) => {
        setLoading(true);
        setError(null);
        setData([]);

        try {
            switch (action) {
                case 'gpo': {
                    const response = await emv.getProcessingOptions();
                    if (response.isOk()) {
                        setData([{ tag: 'GPO', name: 'GET_PROCESSING_OPTIONS', value: response.buffer.toString('hex') }]);
                    } else {
                        setError(`GET PROCESSING OPTIONS failed: SW=${response.sw1.toString(16)}${response.sw2.toString(16)}`);
                    }
                    break;
                }
                case 'records': {
                    const records: { tag: string; name: string; value: string }[] = [];
                    for (let sfi = 1; sfi <= 10; sfi++) {
                        for (let rec = 1; rec <= 10; rec++) {
                            const response = await emv.readRecord(sfi, rec);
                            if (response.isOk()) {
                                const formatted = formatTlv(response);
                                records.push({
                                    tag: `SFI${String(sfi)}:R${String(rec)}`,
                                    name: 'RECORD',
                                    value: formatted || response.buffer.toString('hex')
                                });
                            } else if (response.sw1 === 0x6a && response.sw2 === 0x83) {
                                // Record not found, try next SFI
                                break;
                            }
                        }
                    }
                    if (records.length === 0) {
                        setError('No records found');
                    } else {
                        setData(records);
                    }
                    break;
                }
                case 'pincount': {
                    const response = await emv.getData(0x9f17);
                    if (response.isOk()) {
                        const count = response.buffer[0];
                        setData([{ tag: '9F17', name: 'PIN_TRY_COUNT', value: count !== undefined ? String(count) : 'Unknown' }]);
                    } else {
                        setError(`PIN try count not available: SW=${response.sw1.toString(16)}${response.sw2.toString(16)}`);
                    }
                    break;
                }
                case 'atc': {
                    const response = await emv.getData(0x9f36);
                    if (response.isOk()) {
                        const atcValue = response.buffer.readUInt16BE(0);
                        setData([{ tag: '9F36', name: 'APP_TRANSACTION_COUNTER', value: String(atcValue) }]);
                    } else {
                        setError(`ATC not available: SW=${response.sw1.toString(16)}${response.sw2.toString(16)}`);
                    }
                    break;
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [emv]);

    const items = [
        { label: '📊  Get Processing Options', value: 'gpo' },
        { label: '📁  Read All Records', value: 'records' },
        { label: '🔢  PIN Try Counter', value: 'pincount' },
        { label: '🔄  Application Transaction Counter', value: 'atc' },
        { label: '←   Back', value: 'back' },
    ];

    if (loading) {
        return (
            <Box flexDirection="column">
                <Header />
                <LoadingSpinner message="Reading card data..." />
            </Box>
        );
    }

    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title={`Exploring: ${app.label ?? app.aid}`}>
                {error && <StatusBar message={error} type="error" />}
                {data.length > 0 && (
                    <Box flexDirection="column" marginBottom={1}>
                        {data.map((item, i) => (
                            <Box key={i} flexDirection="column" marginBottom={1}>
                                <Text color="cyan" bold>
                                    {item.tag} ({item.name}):
                                </Text>
                                <Text color="yellow" wrap="wrap">
                                    {item.value}
                                </Text>
                            </Box>
                        ))}
                    </Box>
                )}
                <SelectInput
                    items={items}
                    onSelect={(item) => {
                        if (item.value === 'back') {
                            onBack();
                        } else {
                            setSelectedAction(item.value);
                            void fetchData(item.value);
                        }
                    }}
                    itemComponent={({ isSelected, label }) =>
                        isSelected ? (
                            <Text color="cyan" bold>
                                {'▸ '}
                                {label}
                            </Text>
                        ) : (
                            <Text>
                                {'  '}
                                {label}
                            </Text>
                        )
                    }
                />
            </CardBox>
            <Footer hints={[{ keys: '↑↓', description: 'Navigate' }, { keys: 'Enter', description: 'Select' }, { keys: 'Esc', description: 'Back' }]} />
        </Box>
    );
}

interface ErrorScreenProps {
    message: string;
    onBack: () => void;
}

function ErrorScreen({ message, onBack }: ErrorScreenProps): React.JSX.Element {
    useInput((input, key) => {
        if (key.return || key.escape || input === ' ') {
            onBack();
        }
    });

    return (
        <Box flexDirection="column">
            <Header />
            <StatusBar message={message} type="error" />
            <Footer hints={[{ keys: 'Enter', description: 'Back' }]} />
        </Box>
    );
}

// ============================================================================
// Main App
// ============================================================================

function App(): React.JSX.Element {
    const { exit } = useApp();
    const [screen, setScreen] = useState<Screen>('welcome');
    const [readers, setReaders] = useState<ReaderInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedReader, setSelectedReader] = useState<ReaderInfo | null>(null);
    const [devices, setDevices] = useState<DevicesLike | null>(null);
    const [emv, setEmv] = useState<EmvApplication | null>(null);
    const [apps, setApps] = useState<AppInfo[]>([]);
    const [atr, setAtr] = useState('');
    const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null);
    const [pinLoading, setPinLoading] = useState(false);
    const [pinResult, setPinResult] = useState<{ success: boolean; message: string; attemptsLeft?: number } | null>(null);
    const [pinAttemptsLeft, setPinAttemptsLeft] = useState<number | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);

    // Handle quit
    useInput((input) => {
        if (input === 'q') {
            if (devices) {
                devices.stop();
            }
            exit();
        }
    });

    // Initialize devices
    useEffect(() => {
        let mounted = true;

        const initDevices = async () => {
            try {
                const { Devices } = await import('smartcard');
                const d = new Devices() as DevicesLike;
                if (mounted) {
                    setDevices(d);
                }
            } catch {
                if (mounted) {
                    setError('Failed to initialize PC/SC. Is pcscd running?');
                    setScreen('error');
                }
            }
        };

        void initDevices();

        return () => {
            mounted = false;
        };
    }, []);

    // Refresh readers
    const refreshReaders = useCallback(() => {
        if (!devices) return;

        setLoading(true);
        devices.start();

        setTimeout(() => {
            const readerList = devices.listReaders();
            setReaders(readerList);
            setLoading(false);
        }, 200);
    }, [devices]);

    // Helper function to read apps from a card
    const readAppsFromCard = useCallback(async (readerName: string, card: CardInfo) => {
        setLoading(true);
        setScreen('apps');

        try {
            const { EmvApplication: EmvApp } = await import('./emv-application.js');
            const emvApp = new EmvApp(
                { name: readerName },
                card as unknown as import('./types.js').SmartCard
            );
            setEmv(emvApp);
            setAtr(card.atr?.toString('hex') ?? '');

            // Read apps from PSE
            const pseResponse = await emvApp.selectPse();
            if (pseResponse.isOk()) {
                const sfiData = findTagInBuffer(pseResponse.buffer, 0x88);
                const sfi = sfiData?.[0] ?? 1;
                const appList: AppInfo[] = [];

                for (let record = 1; record <= 10; record++) {
                    const response = await emvApp.readRecord(sfi, record);
                    if (!response.isOk()) break;

                    const aid = findTagInBuffer(response.buffer, 0x4f);
                    if (aid) {
                        const label = findTagInBuffer(response.buffer, 0x50);
                        const priority = findTagInBuffer(response.buffer, 0x87);
                        appList.push({
                            aid: aid.toString('hex'),
                            label: label?.toString('ascii'),
                            priority: priority?.[0],
                        });
                    }
                }
                setApps(appList);
            }
            setLoading(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setScreen('error');
            setLoading(false);
        }
    }, []);

    // Handle reader selection
    const handleReaderSelect = useCallback((reader: ReaderInfo) => {
        setSelectedReader(reader);
        // Clear previous state when selecting a new reader
        setApps([]);
        setEmv(null);
        setAtr('');
        const hasCard = (reader.state & SCARD_STATE_PRESENT) !== 0;

        if (hasCard && devices) {
            // Get the already-connected card directly from the library
            const card = devices.getCard(reader.name);
            if (card) {
                void readAppsFromCard(reader.name, card);
            } else {
                // Card present but not yet connected - wait for card-inserted event
                setLoading(true);
                setScreen('apps');

                const handleCardInserted = (event: unknown): void => {
                    const cardEvent = event as CardInsertedEvent;
                    if (cardEvent.reader.name === reader.name) {
                        devices.off('card-inserted', handleCardInserted);
                        void readAppsFromCard(reader.name, cardEvent.card);
                    }
                };
                devices.on('card-inserted', handleCardInserted);
            }
        } else {
            // Wait for card insertion
            setScreen('waiting');

            if (devices) {
                const handleCardInserted = (event: unknown): void => {
                    const cardEvent = event as CardInsertedEvent;
                    if (cardEvent.reader.name === reader.name) {
                        devices.off('card-inserted', handleCardInserted);
                        void readAppsFromCard(reader.name, cardEvent.card);
                    }
                };
                devices.on('card-inserted', handleCardInserted);
            }
        }
    }, [devices, readAppsFromCard]);

    // Handle app selection
    const handleAppSelect = useCallback(async (app: AppInfo) => {
        if (!emv) return;

        setSelectedApp(app);
        setLoading(true);

        try {
            const aidBuffer = Buffer.from(app.aid, 'hex');
            await emv.selectApplication(aidBuffer);
            setScreen('selected');
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setScreen('error');
        } finally {
            setLoading(false);
        }
    }, [emv]);

    // Handle PIN verification
    const handlePinSubmit = useCallback(async (pin: string) => {
        if (!emv) return;

        setPinLoading(true);

        try {
            const response = await emv.verifyPin(pin);

            if (response.isOk()) {
                setPinResult({ success: true, message: 'PIN verified successfully!' });
            } else if (response.sw1 === 0x63 && (response.sw2 & 0xf0) === 0xc0) {
                const attempts = response.sw2 & 0x0f;
                setPinAttemptsLeft(attempts);
                setPinResult({ success: false, message: 'Wrong PIN.', attemptsLeft: attempts });
            } else if (response.sw1 === 0x69 && response.sw2 === 0x83) {
                setPinResult({ success: false, message: 'PIN is blocked! Card cannot be used.' });
            } else {
                setPinResult({ success: false, message: `Verification failed: SW=${response.sw1.toString(16)}${response.sw2.toString(16)}` });
            }
            setScreen('pin-result');
        } catch (err) {
            setPinResult({ success: false, message: err instanceof Error ? err.message : String(err) });
            setScreen('pin-result');
        } finally {
            setPinLoading(false);
        }
    }, [emv]);

    // Render current screen
    switch (screen) {
        case 'welcome':
            return (
                <WelcomeScreen
                    onContinue={() => {
                        setScreen('readers');
                        refreshReaders();
                    }}
                />
            );

        case 'readers':
            return (
                <ReadersScreen
                    readers={readers}
                    onSelect={handleReaderSelect}
                    onRefresh={refreshReaders}
                    loading={loading}
                />
            );

        case 'waiting':
            return <WaitingScreen readerName={selectedReader?.name ?? 'Unknown'} />;

        case 'apps':
            return (
                <AppsScreen
                    apps={apps}
                    readerName={selectedReader?.name ?? 'Unknown'}
                    atr={atr}
                    onSelect={(app) => void handleAppSelect(app)}
                    onBack={() => { setScreen('readers'); }}
                    loading={loading}
                />
            );

        case 'selected':
            return selectedApp ? (
                <SelectedAppScreen
                    app={selectedApp}
                    onVerifyPin={() => { setScreen('pin'); }}
                    onExplore={() => { setScreen('explore'); }}
                    onBack={() => { setScreen('apps'); }}
                />
            ) : (
                <ErrorScreen message="No app selected" onBack={() => { setScreen('apps'); }} />
            );

        case 'pin':
            return (
                <PinScreen
                    onSubmit={(pin) => void handlePinSubmit(pin)}
                    onBack={() => { setScreen('selected'); }}
                    loading={pinLoading}
                    attemptsLeft={pinAttemptsLeft}
                />
            );

        case 'pin-result':
            return pinResult ? (
                <PinResultScreen
                    success={pinResult.success}
                    message={pinResult.message}
                    attemptsLeft={pinResult.attemptsLeft}
                    onContinue={() => { setScreen('selected'); }}
                />
            ) : (
                <ErrorScreen message="No result" onBack={() => { setScreen('selected'); }} />
            );

        case 'explore':
            return emv && selectedApp ? (
                <ExploreScreen emv={emv} app={selectedApp} onBack={() => { setScreen('selected'); }} />
            ) : (
                <ErrorScreen message="No EMV connection" onBack={() => { setScreen('selected'); }} />
            );

        case 'error':
            return <ErrorScreen message={error ?? 'Unknown error'} onBack={() => { setScreen('readers'); }} />;

        default:
            return <ErrorScreen message="Unknown screen" onBack={() => { setScreen('welcome'); }} />;
    }
}

// ============================================================================
// Entry Point
// ============================================================================

export function runInteractive(): void {
    render(<App />);
}

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith('interactive.js') ?? false;
if (isMainModule) {
    runInteractive();
}
