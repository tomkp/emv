import React from 'react';
import { Box, useInput } from 'ink';
import { Header, Footer, StatusBar } from '../components/index.js';

interface ErrorScreenProps {
    message: string;
    onBack: () => void;
}

export function ErrorScreen({ message, onBack }: ErrorScreenProps): React.JSX.Element {
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
