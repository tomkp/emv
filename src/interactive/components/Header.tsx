import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { showVersion } from '../../cli.js';

// prettier-ignore
const ASCII_ART = [
    '███████╗███╗   ███╗██╗   ██╗',
    '██╔════╝████╗ ████║██║   ██║',
    '█████╗  ██╔████╔██║██║   ██║',
    '██╔══╝  ██║╚██╔╝██║╚██╗ ██╔╝',
    '███████╗██║ ╚═╝ ██║ ╚████╔╝ ',
    '╚══════╝╚═╝     ╚═╝  ╚═══╝  ',
] as const;

export function Header(): React.JSX.Element {
    const version = `v${showVersion()}`;
    const versionPadding = ' '.repeat(24 - version.length + 6);
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Gradient name="rainbow">
                <Text bold>{'╔' + '═'.repeat(63) + '╗'}</Text>
            </Gradient>
            <Text color="cyan" bold>
                ║{' '.repeat(63)}║
            </Text>
            <Text bold>
                <Text color="cyan">{'║  '}</Text>
                <Gradient name="pastel">
                    <Text>{ASCII_ART[0]}</Text>
                </Gradient>
                <Text color="cyan">{' '.repeat(33)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">{'║  '}</Text>
                <Gradient name="pastel">
                    <Text>{ASCII_ART[1]}</Text>
                </Gradient>
                <Text color="yellow">{'   Chip & PIN Explorer'}</Text>
                <Text color="cyan">{' '.repeat(11)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">{'║  '}</Text>
                <Gradient name="pastel">
                    <Text>{ASCII_ART[2]}</Text>
                </Gradient>
                <Text color="yellow">{'   Interactive Mode'}</Text>
                <Text color="cyan">{' '.repeat(14)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">{'║  '}</Text>
                <Gradient name="pastel">
                    <Text>{ASCII_ART[3]}</Text>
                </Gradient>
                <Text color="cyan">{' '.repeat(33)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">{'║  '}</Text>
                <Gradient name="pastel">
                    <Text>{ASCII_ART[4]}</Text>
                </Gradient>
                <Text color="gray">{'   '}{version}</Text>
                <Text color="cyan">{versionPadding}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">{'║  '}</Text>
                <Gradient name="pastel">
                    <Text>{ASCII_ART[5]}</Text>
                </Gradient>
                <Text color="cyan">{' '.repeat(33)}║</Text>
            </Text>
            <Text color="cyan" bold>
                ║{' '.repeat(63)}║
            </Text>
            <Gradient name="rainbow">
                <Text bold>{'╚' + '═'.repeat(63) + '╝'}</Text>
            </Gradient>
        </Box>
    );
}
