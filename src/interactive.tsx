#!/usr/bin/env node
/**
 * Interactive EMV CLI - re-export for backward compatibility
 * The implementation has been moved to ./interactive/
 */

export { runInteractive, PinScreen } from './interactive/index.js';
export type { PinScreenProps } from './interactive/index.js';

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith('interactive.js') ?? false;
if (isMainModule) {
    const { runInteractive } = await import('./interactive/index.js');
    runInteractive();
}
