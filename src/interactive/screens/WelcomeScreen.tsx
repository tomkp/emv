import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Header, Footer, CardBox } from '../components/index.js';

interface WelcomeScreenProps {
    onContinue: () => void;
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps): React.JSX.Element {
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
                    Welcome to the{' '}
                    <Text color="cyan" bold>
                        EMV Interactive Explorer
                    </Text>
                    !
                </Text>
                <Text> </Text>
                <Text color="gray">
                    This tool lets you explore EMV chip cards connected via PC/SC readers.
                </Text>
                <Text color="gray">
                    You can discover applications, read card data, and verify PINs.
                </Text>
            </CardBox>
            <Footer
                hints={[
                    { keys: 'Enter', description: 'Start' },
                    { keys: 'q', description: 'Quit' },
                ]}
            />
        </Box>
    );
}
