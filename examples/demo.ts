/**
 * EMV Demo - Example usage of the EMV library
 *
 * This example demonstrates how to:
 * - Connect to a card reader
 * - Select the PSE (Payment System Environment)
 * - Read application records
 * - Extract Application IDs (AIDs)
 */

import devices from 'card-reader';
import { EmvApplication, format, findTag } from '../src/index.js';

interface DeviceEvent {
    reader: { name: string };
}

interface CardEvent {
    reader: { name: string };
    status: { atr: Buffer };
}

interface CommandEvent {
    reader: { name: string };
    command: string;
}

interface ResponseEvent {
    reader: { name: string };
    command: string;
    response: string;
}

interface ErrorEvent {
    error: Error;
}

devices.on('device-activated', (event: DeviceEvent) => {
    console.log(`Device '${event.reader.name}' activated, devices: ${devices.listDevices()}`);
});

devices.on('device-deactivated', (event: DeviceEvent) => {
    console.log(`Device '${event.reader.name}' deactivated, devices: ${devices.listDevices()}`);
});

devices.on('card-removed', (event: DeviceEvent) => {
    console.log(`Card removed from '${event.reader.name}'`);
});

devices.on('command-issued', (event: CommandEvent) => {
    console.log(`Command '${event.command}' issued to '${event.reader.name}'`);
});

devices.on('response-received', (event: ResponseEvent) => {
    console.log(
        `Response '${event.response}' received from '${event.reader.name}' in response to '${event.command}'`
    );
});

devices.on('error', (event: ErrorEvent) => {
    console.log(`Error '${event.error}' received`);
});

devices.on('card-inserted', (event: CardEvent) => {
    console.log(`List devices: ${devices.listDevices()}`);

    const reader = event.reader;
    console.log(`Card inserted into '${reader.name}', atr: '${event.status.atr.toString('hex')}'`);

    const application = new EmvApplication(devices, reader);

    application
        .selectPse()
        .then((response) => {
            console.info(`Select PSE Response:\n${format(response)}`);

            const sfiBuffer = findTag(response, 0x88);
            if (!sfiBuffer) {
                throw new Error('SFI not found in response');
            }

            const sfi = sfiBuffer.toString('hex');
            const records = [0, 1, 2, 3, 4, 5, 6];
            const aids: string[] = [];

            let queue = Promise.resolve<string[]>(aids);

            records.forEach((record) => {
                queue = queue.then(() => {
                    return application.readRecord(parseInt(sfi, 16), record).then((response) => {
                        if (response.isOk()) {
                            console.info(`Read Record Response: \n${format(response)}`);
                            const aid = findTag(response, 0x4f);
                            if (aid) {
                                console.info(`Application ID: '${aid.toString('hex')}'`);
                                aids.push(aid.toString('hex'));
                            }
                        }
                        return aids;
                    });
                });
            });

            return queue;
        })
        .then((applicationIds) => {
            console.info(`Application IDs: '${applicationIds.join(', ')}'`);
        })
        .catch((error) => {
            console.error('Error:', error);
        });
});
