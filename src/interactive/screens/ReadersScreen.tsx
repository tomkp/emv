import React from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { Header, Footer, CardBox, StatusBar, LoadingSpinner } from '../components/index.js';
import { SCARD_STATE_PRESENT, type ReaderInfo } from '../types.js';

interface ReadersScreenProps {
    readers: ReaderInfo[];
    onSelect: (reader: ReaderInfo) => void;
    onRefresh: () => void;
    loading: boolean;
}

export function ReadersScreen({
    readers,
    onSelect,
    onRefresh,
    loading,
}: ReadersScreenProps): React.JSX.Element {
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
                <StatusBar
                    message="No card readers found. Connect a reader and press 'r' to refresh."
                    type="warning"
                />
                <Footer
                    hints={[
                        { keys: 'r', description: 'Refresh' },
                        { keys: 'q', description: 'Quit' },
                    ]}
                />
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
                    { keys: 'r', description: 'Refresh' },
                    { keys: 'q', description: 'Quit' },
                ]}
            />
        </Box>
    );
}
