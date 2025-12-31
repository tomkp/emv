import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface LoadingSpinnerProps {
    message: string;
}

export function LoadingSpinner({ message }: LoadingSpinnerProps): React.JSX.Element {
    return (
        <Box marginY={1} paddingX={2}>
            <Text color="cyan">
                <Spinner type="dots" />
            </Text>
            <Text color="cyan"> {message}</Text>
        </Box>
    );
}
