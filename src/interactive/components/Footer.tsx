import React from 'react';
import { Box, Text } from 'ink';

interface KeyHintProps {
    keys: string;
    description: string;
}

function KeyHint({ keys, description }: KeyHintProps): React.JSX.Element {
    return (
        <Box marginRight={2}>
            <Text color="yellow" bold>
                [{keys}]
            </Text>
            <Text color="gray"> {description}</Text>
        </Box>
    );
}

interface FooterProps {
    hints: { keys: string; description: string }[];
}

export function Footer({ hints }: FooterProps): React.JSX.Element {
    return (
        <Box marginTop={1} paddingX={2} flexWrap="wrap">
            {hints.map((hint, index) => (
                <KeyHint key={index} keys={hint.keys} description={hint.description} />
            ))}
        </Box>
    );
}
