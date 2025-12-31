import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { Header, Footer, CardBox } from '../components/index.js';
import type { AppInfo } from '../types.js';

interface SelectedAppScreenProps {
    app: AppInfo;
    onVerifyPin: () => void;
    onExplore: () => void;
    onBack: () => void;
}

export function SelectedAppScreen({
    app,
    onVerifyPin,
    onExplore,
    onBack,
}: SelectedAppScreenProps): React.JSX.Element {
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
                    <Text color="cyan" bold>
                        Name:{' '}
                    </Text>
                    <Text>{app.label ?? 'Unknown'}</Text>
                </Text>
                <Text>
                    <Text color="cyan" bold>
                        AID:{' '}
                    </Text>
                    <Text color="yellow">{app.aid}</Text>
                </Text>
                {app.priority !== undefined && (
                    <Text>
                        <Text color="cyan" bold>
                            Priority:{' '}
                        </Text>
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
            <Footer
                hints={[
                    { keys: '↑↓', description: 'Navigate' },
                    { keys: 'Enter', description: 'Select' },
                    { keys: 'q', description: 'Quit' },
                ]}
            />
        </Box>
    );
}
