# EMV

[![CI](https://github.com/tomkp/emv/actions/workflows/ci.yml/badge.svg)](https://github.com/tomkp/emv/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/emv.svg)](https://www.npmjs.com/package/emv)

Interactive EMV chip card explorer for PC/SC card readers. Discover payment applications, read card data, verify PINs, and explore EMV tag structures with a beautiful terminal UI.

<img width="600" alt="CleanShot 2025-12-29 at 22 08 16@2x" src="https://github.com/user-attachments/assets/2a074179-69e5-4ad5-80d0-7497d82643df" />

## Features

- Interactive terminal UI with keyboard navigation
- Auto-detect card readers and inserted cards
- Discover payment applications on EMV cards
- Read and decode EMV tag structures
- PIN verification (plaintext - for test cards only)
- View transaction counters and card data

## Installation

```bash
npm install -g emv
```

## Quick Start

Run the interactive explorer:

```bash
emv
```

Use arrow keys to navigate, Enter to select, and `q` to quit.

**Requirements:**

- Node.js 20 or later
- PC/SC library installed on your system

**Linux:**

```bash
sudo apt-get install libpcsclite-dev pcscd
sudo systemctl start pcscd
```

**macOS/Windows:** No additional setup required.

## Programmatic API

The library can also be used programmatically:

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
```

#### Selection Commands

```typescript
// Select Payment System Environment
const response = await emv.selectPse();

// Select an application by AID
const response = await emv.selectApplication([0xa0, 0x00, 0x00, 0x00, 0x04]);
```

#### Read Commands

```typescript
// Read a record from SFI
const response = await emv.readRecord(sfi, recordNumber);

// Get data by EMV tag (e.g., PIN Try Counter)
const response = await emv.getData(0x9f17);
if (response.isOk()) {
    // Parse TLV: 9F17 01 03 = 3 attempts remaining
    console.log('PIN tries left:', response.buffer[3]);
}
```

#### PIN Verification

```typescript
// Verify cardholder PIN (plaintext)
const response = await emv.verifyPin('1234');

if (response.isOk()) {
    console.log('PIN verified successfully');
} else if (response.sw1 === 0x63 && (response.sw2 & 0xf0) === 0xc0) {
    const attemptsLeft = response.sw2 & 0x0f;
    console.log(`Wrong PIN, ${attemptsLeft} attempts remaining`);
} else if (response.sw1 === 0x69 && response.sw2 === 0x83) {
    console.log('PIN is blocked');
}
```

#### Transaction Processing

```typescript
// 1. Initiate transaction with GET PROCESSING OPTIONS
const gpoResponse = await emv.getProcessingOptions();
// Or with PDOL data:
const gpoResponse = await emv.getProcessingOptions(pdolData);

if (gpoResponse.isOk()) {
    // Response contains AIP and AFL
    console.log('Transaction initiated');
}

// 2. Generate Application Cryptogram
// ARQC (0x80) = go online, TC (0x40) = approve offline, AAC (0x00) = decline
const acResponse = await emv.generateAc(0x80, cdolData);

if (acResponse.isOk()) {
    // Parse cryptogram from response for online authorization
    console.log('Cryptogram generated');
}
```

#### Card Authentication (DDA)

```typescript
// Internal Authenticate for Dynamic Data Authentication
const unpredictableNumber = Buffer.from([0x12, 0x34, 0x56, 0x78]);
const response = await emv.internalAuthenticate(unpredictableNumber);

if (response.isOk()) {
    // Verify signed data using ICC Public Key
    const signedData = response.buffer;
}
```

#### Utility Methods

```typescript
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

## Related Packages

If you're working with EMV or smartcard applications, these packages may be useful:

- **[ber-tlv](https://github.com/tomkp/ber-tlv)** - BER-TLV encoding and decoding library. Useful if you need to work directly with TLV (Tag-Length-Value) structures, which are fundamental to EMV data encoding.

- **[smartcard](https://github.com/tomkp/smartcard)** - PC/SC smartcard reader access for Node.js. This package provides the low-level communication layer for talking to smartcard readers, which this EMV library builds upon.

## License

MIT
