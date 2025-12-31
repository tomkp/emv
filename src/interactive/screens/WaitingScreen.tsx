import React from 'react';
import { Box, Text } from 'ink';
import { Header, Footer, CardBox, LoadingSpinner } from '../components/index.js';

interface WaitingScreenProps {
    readerName: string;
}

export function WaitingScreen({ readerName }: WaitingScreenProps): React.JSX.Element {
    return (
        <Box flexDirection="column">
            <Header />
            <CardBox title="Waiting for Card">
                <Text color="gray">Reader: {readerName}</Text>
                <Text> </Text>
                <LoadingSpinner message="Insert a card to continue..." />
            </CardBox>
            <Footer
                hints={[
                    { keys: 'Esc', description: 'Back' },
                    { keys: 'q', description: 'Quit' },
                ]}
            />
        </Box>
    );
}
