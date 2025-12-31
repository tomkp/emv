import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
    message: string;
    type?: 'info' | 'success' | 'warning' | 'error';
}

export function StatusBar({ message, type = 'info' }: StatusBarProps): React.JSX.Element {
    const colors = {
        info: 'blue',
        success: 'green',
        warning: 'yellow',
        error: 'red',
    } as const satisfies Record<NonNullable<StatusBarProps['type']>, string>;
    const icons = {
        info: 'ℹ',
        success: '✓',
        warning: '⚠',
        error: '✗',
    } as const satisfies Record<NonNullable<StatusBarProps['type']>, string>;

    return (
        <Box marginY={1} paddingX={2}>
            <Text color={colors[type]} bold>
                {icons[type]}{' '}
            </Text>
            <Text color={colors[type]}>{message}</Text>
        </Box>
    );
}
