#!/usr/bin/env node
/**
 * Interactive EMV CLI with a beautiful, modern UX
 * Inspired by Claude Code and OpenCode
 */

import React, { useState, useEffect, useCallback } from 'react';
import { render, useApp, useInput } from 'ink';
import { EmvApplication } from '../emv-application.js';
import {
    WelcomeScreen,
    ReadersScreen,
    WaitingScreen,
    AppsScreen,
    SelectedAppScreen,
    PinScreen,
    PinResultScreen,
    ExploreScreen,
    ErrorScreen,
} from './screens/index.js';
import {
    SCARD_STATE_PRESENT,
    type Screen,
    type ReaderInfo,
    type CardInfo,
    type DevicesLike,
    type CardInsertedEvent,
    type AppInfo,
} from './types.js';

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
    const [pinResult, setPinResult] = useState<{
        success: boolean;
        message: string;
        attemptsLeft?: number;
    } | null>(null);
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
            const { EmvApplication: EmvApp } = await import('../emv-application.js');
            const emvApp = new EmvApp(
                { name: readerName },
                card as unknown as import('../types.js').SmartCard
            );
            setEmv(emvApp);
            setAtr(card.atr?.toString('hex') ?? '');

            // Use the discoverApplications method to read apps from PSE
            const result = await emvApp.discoverApplications();
            if (result.success) {
                setApps(result.apps);
            }
            setLoading(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setScreen('error');
            setLoading(false);
        }
    }, []);

    // Handle reader selection
    const handleReaderSelect = useCallback(
        (reader: ReaderInfo) => {
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
        },
        [devices, readAppsFromCard]
    );

    // Handle app selection
    const handleAppSelect = useCallback(
        async (app: AppInfo) => {
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
        },
        [emv]
    );

    // Handle PIN verification
    const handlePinSubmit = useCallback(
        async (pin: string) => {
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
                    setPinResult({
                        success: false,
                        message: 'PIN is blocked! Card cannot be used.',
                    });
                } else {
                    setPinResult({
                        success: false,
                        message: `Verification failed: SW=${response.sw1.toString(16)}${response.sw2.toString(16)}`,
                    });
                }
                setScreen('pin-result');
            } catch (err) {
                setPinResult({
                    success: false,
                    message: err instanceof Error ? err.message : String(err),
                });
                setScreen('pin-result');
            } finally {
                setPinLoading(false);
            }
        },
        [emv]
    );

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
                    onBack={() => {
                        setScreen('readers');
                    }}
                    loading={loading}
                />
            );

        case 'selected':
            return selectedApp ? (
                <SelectedAppScreen
                    app={selectedApp}
                    onVerifyPin={() => {
                        setScreen('pin');
                    }}
                    onExplore={() => {
                        setScreen('explore');
                    }}
                    onBack={() => {
                        setScreen('apps');
                    }}
                />
            ) : (
                <ErrorScreen
                    message="No app selected"
                    onBack={() => {
                        setScreen('apps');
                    }}
                />
            );

        case 'pin':
            return (
                <PinScreen
                    onSubmit={(pin) => void handlePinSubmit(pin)}
                    onBack={() => {
                        setScreen('selected');
                    }}
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
                    onContinue={() => {
                        setScreen('selected');
                    }}
                />
            ) : (
                <ErrorScreen
                    message="No result"
                    onBack={() => {
                        setScreen('selected');
                    }}
                />
            );

        case 'explore':
            return emv && selectedApp ? (
                <ExploreScreen
                    emv={emv}
                    app={selectedApp}
                    onBack={() => {
                        setScreen('selected');
                    }}
                />
            ) : (
                <ErrorScreen
                    message="No EMV connection"
                    onBack={() => {
                        setScreen('selected');
                    }}
                />
            );

        case 'error':
            return (
                <ErrorScreen
                    message={error ?? 'Unknown error'}
                    onBack={() => {
                        setScreen('readers');
                    }}
                />
            );

        default:
            return (
                <ErrorScreen
                    message="Unknown screen"
                    onBack={() => {
                        setScreen('welcome');
                    }}
                />
            );
    }
}

export function runInteractive(): void {
    render(<App />);
}

// Export PinScreen for testing
export { PinScreen } from './screens/index.js';
export type { PinScreenProps } from './screens/index.js';

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith('interactive.js') ?? false;
if (isMainModule) {
    runInteractive();
}
