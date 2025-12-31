import React from 'react';
import { Box, Text, useInput } from 'ink';
import Gradient from 'ink-gradient';
import { Header, Footer, CardBox } from '../components/index.js';

interface PinResultScreenProps {
    success: boolean;
    message: string;
    attemptsLeft: number | undefined;
    onContinue: () => void;
}

export function PinResultScreen({
    success,
    message,
    attemptsLeft,
    onContinue,
}: PinResultScreenProps): React.JSX.Element {
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
                            <Text color="yellow">Attempts remaining: {attemptsLeft}</Text>
                        )}
                    </Box>
                )}
            </CardBox>
            <Footer hints={[{ keys: 'Enter', description: 'Continue' }]} />
        </Box>
    );
}
