/**
 * EMV Demo - Example usage of the EMV library with smartcard package
 *
 * This example demonstrates how to:
 * - Connect to a card reader using the smartcard package
 * - Select the PSE (Payment System Environment)
 * - Read application records
 * - Extract Application IDs (AIDs)
 */

import { Devices } from 'smartcard';
import { EmvApplication, format, findTag } from '../src/index.js';

// Type definitions for smartcard events
interface CardEvent {
    reader: { name: string };
    card: {
        atr: Buffer;
        transmit(apdu: Buffer | number[]): Promise<Buffer>;
    };
}

interface ReaderEvent {
    name: string;
}

interface ErrorEvent {
    message: string;
}

const devices = new Devices();

devices.on('reader-attached', (reader: ReaderEvent) => {
    console.log(`Reader attached: ${reader.name}`);
});

devices.on('reader-detached', (reader: ReaderEvent) => {
    console.log(`Reader detached: ${reader.name}`);
});

devices.on('card-removed', ({ reader }: { reader: ReaderEvent }) => {
    console.log(`Card removed from '${reader.name}'`);
});

devices.on('error', (err: ErrorEvent) => {
    console.error(`Error: ${err.message}`);
});

devices.on('card-inserted', async ({ reader, card }: CardEvent) => {
    console.log(`Card inserted into '${reader.name}', ATR: '${card.atr.toString('hex')}'`);

    const application = new EmvApplication(reader, card);

    try {
        // Select PSE
        const pseResponse = await application.selectPse();
        console.info(`Select PSE Response:\n${format(pseResponse)}`);

        const sfiBuffer = findTag(pseResponse, 0x88);
        if (!sfiBuffer) {
            console.error('SFI not found in response');
            return;
        }

        const sfi = sfiBuffer[0];
        if (sfi === undefined) {
            console.error('Invalid SFI value');
            return;
        }

        const aids: string[] = [];

        // Read records to find AIDs
        for (let record = 1; record <= 10; record++) {
            const response = await application.readRecord(sfi, record);

            if (!response.isOk()) {
                break; // No more records
            }

            console.info(`Read Record ${record} Response:\n${format(response)}`);

            const aid = findTag(response, 0x4f);
            if (aid) {
                const aidHex = aid.toString('hex');
                console.info(`Found Application ID: '${aidHex}'`);
                aids.push(aidHex);
            }
        }

        console.info(`\nApplication IDs found: ${aids.length > 0 ? aids.join(', ') : 'none'}`);
    } catch (error) {
        console.error('Error:', error);
    }
});

// Start monitoring for readers
devices.start();

console.log('Waiting for card reader... (Press Ctrl+C to exit)');

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    devices.stop();
    process.exit(0);
});
