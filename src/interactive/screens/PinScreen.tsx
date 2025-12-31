import React, { useState, useCallback } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import TextInput from 'ink-text-input';
import { Header, Footer, CardBox, LoadingSpinner } from '../components/index.js';

export interface PinScreenProps {
    onSubmit: (pin: string) => void;
    onBack: () => void;
    loading: boolean;
    attemptsLeft: number | undefined;
    /** Override raw mode detection for testing. If not provided, uses useStdin() hook. */
    isRawModeSupported?: boolean;
}

export function PinScreen({
    onSubmit,
    onBack,
    loading,
    attemptsLeft,
    isRawModeSupported: isRawModeProp,
}: PinScreenProps): React.JSX.Element {
    const [pin, setPin] = useState('');
    const { isRawModeSupported: isRawModeFromStdin } = useStdin();
    const isRawModeSupported = isRawModeProp ?? isRawModeFromStdin;

    useInput((_input, key) => {
        if (key.escape) {
            onBack();
        }
    });

    const handleSubmit = useCallback(
        (value: string) => {
            if (value.length >= 4 && value.length <= 12 && /^\d+$/.test(value)) {
                onSubmit(value);
            }
        },
        [onSubmit]
    );

    if (loading) {
        return (
            <Box flexDirection="column">
                <Header />
                <LoadingSpinner message="Verifying PIN..." />
            </Box>
        );
    }

    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title="PIN Verification">
                {attemptsLeft !== undefined && attemptsLeft < 3 && (
                    <Box marginBottom={1}>
                        <Text color="yellow" bold>
                            ⚠ Warning: {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''}{' '}
                            remaining!
                        </Text>
                    </Box>
                )}
                <Text color="gray">Enter your 4-12 digit PIN:</Text>
                <Text> </Text>
                <Box>
                    <Text color="cyan" bold>
                        PIN:{' '}
                    </Text>
                    {isRawModeSupported ? (
                        <TextInput value={pin} onChange={setPin} onSubmit={handleSubmit} mask="•" />
                    ) : (
                        <Text color="gray">(raw mode not supported)</Text>
                    )}
                </Box>
                <Text> </Text>
                <Text color="gray" dimColor>
                    PIN is sent in plaintext - use only with test cards!
                </Text>
            </CardBox>
            <Footer
                hints={[
                    { keys: 'Enter', description: 'Submit' },
                    { keys: 'Esc', description: 'Back' },
                ]}
            />
        </Box>
    );
}
