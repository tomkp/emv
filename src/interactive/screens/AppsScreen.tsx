import React from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { Header, Footer, CardBox, StatusBar, LoadingSpinner } from '../components/index.js';
import type { AppInfo } from '../types.js';

interface AppsScreenProps {
    apps: AppInfo[];
    readerName: string;
    atr: string;
    onSelect: (app: AppInfo) => void;
    onBack: () => void;
    loading: boolean;
}

export function AppsScreen({
    apps,
    readerName,
    atr,
    onSelect,
    onBack,
    loading,
}: AppsScreenProps): React.JSX.Element {
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
                <Footer
                    hints={[
                        { keys: 'Esc', description: 'Back' },
                        { keys: 'q', description: 'Quit' },
                    ]}
                />
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
                    onSelect={(item) => {
                        onSelect(item.value);
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
            <Footer
                hints={[
                    { keys: '↑↓', description: 'Navigate' },
                    { keys: 'Enter', description: 'Select' },
                    { keys: 'Esc', description: 'Back' },
                    { keys: 'q', description: 'Quit' },
                ]}
            />
        </Box>
    );
}
