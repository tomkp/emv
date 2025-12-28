# EMV

[![CI](https://github.com/tomkp/emv/actions/workflows/ci.yml/badge.svg)](https://github.com/tomkp/emv/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/emv.svg)](https://www.npmjs.com/package/emv)

EMV / Chip and PIN library for PC/SC card readers.

## Installation

```bash
npm install emv smartcard
```

**Requirements:**

- Node.js 20 or later
- PC/SC library installed on your system

**Linux:**

```bash
sudo apt-get install libpcsclite-dev pcscd
sudo systemctl start pcscd
```

**macOS/Windows:** No additional setup required.

## Usage

```typescript
import { Devices } from 'smartcard';
import { EmvApplication, format, findTag } from 'emv';

const devices = new Devices();

devices.on('card-inserted', async ({ reader, card }) => {
    console.log(`Card inserted into '${reader.name}'`);
    console.log(`ATR: ${card.atr.toString('hex')}`);

    const emv = new EmvApplication(reader, card);

    try {
        // Select Payment System Environment
        const pseResponse = await emv.selectPse();
        console.log(`PSE Response:\n${format(pseResponse)}`);

        // Find SFI tag
        const sfiBuffer = findTag(pseResponse, 0x88);
        if (!sfiBuffer) {
            console.log('SFI not found');
            return;
        }

        const sfi = sfiBuffer[0];
        if (sfi === undefined) return;

        // Read application records
        for (let record = 1; record <= 10; record++) {
            const response = await emv.readRecord(sfi, record);

            if (!response.isOk()) break;

            console.log(`Record ${record}:\n${format(response)}`);

            const aid = findTag(response, 0x4f);
            if (aid) {
                console.log(`Found AID: ${aid.toString('hex')}`);
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
});

devices.on('error', (err) => {
    console.error('Device error:', err.message);
});

devices.start();
```

## API

### EmvApplication

```typescript
import { EmvApplication } from 'emv';

const emv = new EmvApplication(reader, card);

// Select Payment System Environment
const response = await emv.selectPse();

// Select an application by AID
const response = await emv.selectApplication([0xa0, 0x00, 0x00, 0x00, 0x04]);

// Read a record from SFI
const response = await emv.readRecord(sfi, recordNumber);

// Get card ATR
const atr = emv.getAtr();

// Get reader name
const name = emv.getReaderName();
```

### Utility Functions

```typescript
import { format, findTag, getTagName, EMV_TAGS } from 'emv';

// Format response as readable string
const formatted = format(response);

// Find a specific tag in response
const aid = findTag(response, 0x4f);

// Get human-readable tag name
const name = getTagName(0x4f); // 'APP_IDENTIFIER'

// Access EMV tag dictionary
console.log(EMV_TAGS['4F']); // 'APP_IDENTIFIER'
```

## Compatible Readers

Tested with:

- SCM SCR3500 Smart Card Reader
- ACR122U (contactless)
- Any PC/SC compatible reader

## License

MIT
