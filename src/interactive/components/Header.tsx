import React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';

export function Header(): React.JSX.Element {
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Gradient name="rainbow">
                <Text bold>{'╔' + '═'.repeat(63) + '╗'}</Text>
            </Gradient>
            <Text color="cyan" bold>║{' '.repeat(63)}║</Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>███████╗███╗   ███╗██╗   ██╗</Text>
                </Gradient>
                <Text color="cyan">{' '.repeat(33)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>██╔════╝████╗ ████║██║   ██║</Text>
                </Gradient>
                <Text color="yellow">   Chip &amp; PIN Explorer</Text>
                <Text color="cyan">{' '.repeat(11)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>█████╗  ██╔████╔██║██║   ██║</Text>
                </Gradient>
                <Text color="yellow">   Interactive Mode</Text>
                <Text color="cyan">{' '.repeat(14)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>██╔══╝  ██║╚██╔╝██║╚██╗ ██╔╝</Text>
                </Gradient>
                <Text color="cyan">{' '.repeat(33)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>███████╗██║ ╚═╝ ██║ ╚████╔╝ </Text>
                </Gradient>
                <Text color="gray">   v2.0.0</Text>
                <Text color="cyan">{' '.repeat(24)}║</Text>
            </Text>
            <Text bold>
                <Text color="cyan">║  </Text>
                <Gradient name="pastel">
                    <Text>╚══════╝╚═╝     ╚═╝  ╚═══╝  </Text>
                </Gradient>
                <Text color="cyan">{' '.repeat(33)}║</Text>
            </Text>
            <Text color="cyan" bold>║{' '.repeat(63)}║</Text>
            <Gradient name="rainbow">
                <Text bold>{'╚' + '═'.repeat(63) + '╝'}</Text>
            </Gradient>
        </Box>
    );
}
