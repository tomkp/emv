import React from 'react';
import { Box, Text } from 'ink';

interface CardBoxProps {
    title: string;
    children: React.ReactNode;
}

export function CardBox({ title, children }: CardBoxProps): React.JSX.Element {
    return (
        <Box flexDirection="column" marginY={1} paddingX={2}>
            <Box marginBottom={1}>
                <Text color="magenta" bold>
                    ┌─ {title} ─
                </Text>
            </Box>
            <Box flexDirection="column" paddingLeft={2}>
                {children}
            </Box>
        </Box>
    );
}
