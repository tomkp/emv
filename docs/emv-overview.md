# EMV Overview

EMV is the global standard for chip-based payment cards. The name comes from its original developers: Europay, Mastercard, and Visa.

This guide explains how EMV works and what you can do with this library.

## Contents

- [Why EMV exists](#why-emv-exists)
- [How cards communicate](#how-cards-communicate)
- [Command structure](#command-structure)
- [Transaction flow](#transaction-flow)
- [Common commands](#common-commands)
- [What you can do](#what-you-can-do)

## Why EMV exists

Before chip cards, payment cards used magnetic stripes. These were easy to copy - criminals could clone cards with cheap equipment.

Chip cards solve this by:

- storing data in a secure microprocessor
- generating unique codes for each transaction
- requiring cryptographic authentication

The chip makes it much harder to create counterfeit cards.

## How cards communicate

Cards and readers talk using a protocol called APDU (Application Protocol Data Unit). Think of it as a simple request-response system:

1. The reader sends a **command** to the card
2. The card processes it and sends back a **response**

All data travels as bytes. The card never initiates communication - it only responds to commands.

### Physical connection

Cards connect through:

- **Contact interface** - the gold chip you insert into a reader
- **Contactless interface** - the antenna that lets you tap to pay

Both use the same APDU commands. This library works with both.

## Command structure

Every command follows the same format:

| Field | Size | Purpose |
|-------|------|---------|
| CLA | 1 byte | Class - usually `00` for standard commands |
| INS | 1 byte | Instruction - the command type |
| P1 | 1 byte | Parameter 1 - varies by command |
| P2 | 1 byte | Parameter 2 - varies by command |
| Lc | 1 byte | Length of data being sent (optional) |
| Data | variable | Command data (optional) |
| Le | 1 byte | Expected response length (optional) |

### Response structure

Every response ends with two status bytes:

| Field | Size | Purpose |
|-------|------|---------|
| Data | variable | Response data (optional) |
| SW1 | 1 byte | Status word 1 |
| SW2 | 1 byte | Status word 2 |

Common status codes:

| SW1 SW2 | Meaning |
|---------|---------|
| `90 00` | Success |
| `6A 82` | File or application not found |
| `63 Cx` | Wrong PIN, x attempts remaining |
| `69 83` | PIN blocked |
| `69 85` | Conditions not satisfied |

## Transaction flow

A typical EMV transaction follows these steps:

### 1. Application selection

First, find out what payment applications the card supports.

```
Reader: SELECT PSE (Payment System Environment)
Card: Returns list of available applications
Reader: SELECT specific application (e.g., Visa, Mastercard)
Card: Returns application data
```

The card may have multiple applications - for example, both a debit and credit account.

### 2. Read application data

Once you've selected an application, read its data.

```
Reader: GET PROCESSING OPTIONS
Card: Returns AIP (Application Interchange Profile) and AFL (Application File Locator)
Reader: READ RECORD (for each file/record in AFL)
Card: Returns record data containing cardholder info, certificates, etc.
```

The AFL tells you which files and records to read.

### 3. Cardholder verification

Verify the cardholder is legitimate. Methods include:

- **Online PIN** - PIN sent to issuer for verification
- **Offline PIN** - PIN verified by the card itself
- **Signature** - traditional signature check
- **No CVM** - for low-value contactless

```
Reader: VERIFY PIN
Card: Returns success or failure with remaining attempts
```

### 4. Transaction decision

The card decides whether to approve the transaction.

```
Reader: GENERATE AC (Application Cryptogram)
Card: Returns cryptogram - either:
  - TC (Transaction Certificate) - approved offline
  - ARQC (Authorization Request Cryptogram) - go online
  - AAC (Application Authentication Cryptogram) - declined
```

For online transactions, the cryptogram is sent to the issuer for verification.

## Common commands

### SELECT

Selects a file or application on the card.

```
CLA: 00
INS: A4
P1:  04 (select by name)
P2:  00
Data: AID (Application Identifier)
```

Common AIDs:

| AID | Application |
|-----|-------------|
| `A0 00 00 00 03` | Visa |
| `A0 00 00 00 04` | Mastercard |
| `A0 00 00 00 25` | American Express |
| `A0 00 00 00 65` | JCB |
| `A0 00 00 01 52` | Discover |

### READ RECORD

Reads a record from the card.

```
CLA: 00
INS: B2
P1:  Record number
P2:  (SFI << 3) | 0x04
```

The SFI (Short File Identifier) comes from the AFL returned by GET PROCESSING OPTIONS.

### GET DATA

Retrieves specific data objects by tag.

```
CLA: 80
INS: CA
P1:  Tag byte 1
P2:  Tag byte 2
```

Useful tags:

| Tag | Data |
|-----|------|
| `9F 17` | PIN try counter |
| `9F 36` | Application transaction counter |
| `9F 13` | Last online ATC |
| `9F 4F` | Log format |

### VERIFY

Verifies the cardholder PIN.

```
CLA: 00
INS: 20
P1:  00
P2:  80 (plaintext PIN)
Data: PIN block
```

The PIN block format: `2x yyyy yyyy FF FF FF FF FF` where x is the PIN length and each y is a PIN digit (0-9).

### GET PROCESSING OPTIONS

Initiates a transaction and returns card capabilities.

```
CLA: 80
INS: A8
P1:  00
P2:  00
Data: PDOL data (Processing Options Data Object List)
```

Returns the AIP and AFL needed to continue the transaction.

### GENERATE AC

Requests a cryptogram for transaction authorisation.

```
CLA: 80
INS: AE
P1:  Reference control (40=TC, 80=ARQC, 00=AAC)
P2:  00
Data: CDOL data (Card Risk Management Data Object List)
```

### INTERNAL AUTHENTICATE

Used for Dynamic Data Authentication (DDA).

```
CLA: 00
INS: 88
P1:  00
P2:  00
Data: Authentication data (usually unpredictable number)
```

The card signs the data with its private key, proving it's genuine.

## What you can do

This library lets you:

### Explore cards

- List payment applications on a card
- Read cardholder name and PAN (if not blocked)
- View transaction counters
- Check PIN try counter

### Verify PINs

Test PIN verification on **test cards only**. Never enter a real PIN in untrusted software.

### Understand EMV

- See raw APDU commands and responses
- Decode TLV (Tag-Length-Value) data structures
- Learn how payment terminals communicate with cards

### Build applications

Use the programmatic API to:

- integrate with payment systems
- build testing tools
- develop educational software

## Data encoding

EMV uses BER-TLV (Basic Encoding Rules - Tag Length Value) to structure data. Each piece of data has:

- **Tag** - identifies what the data is (1-3 bytes)
- **Length** - how many bytes of data follow (1-3 bytes)
- **Value** - the actual data

Tags can be:

- **Primitive** - contains data directly
- **Constructed** - contains other TLV objects

Common EMV tags:

| Tag | Name | Description |
|-----|------|-------------|
| `4F` | AID | Application identifier |
| `50` | Application Label | Human-readable app name |
| `57` | Track 2 | Card number and expiry |
| `5A` | PAN | Primary account number |
| `5F20` | Cardholder Name | Name on the card |
| `5F24` | Expiry Date | YYMMDD format |
| `82` | AIP | Application Interchange Profile |
| `94` | AFL | Application File Locator |
| `9F26` | Cryptogram | Application cryptogram |
| `9F27` | CID | Cryptogram type indicator |

## Security considerations

When working with EMV:

- **Never log real card data** - PANs and track data are sensitive
- **Use test cards** - don't experiment with real payment cards
- **Don't store PINs** - verify and forget
- **Understand the limits** - this library is for learning and testing, not production payment processing

## Further reading

- EMV specifications are available from [EMVCo](https://www.emvco.com/)
- ISO 7816 defines the smart card communication protocol
- ISO 8583 covers the message format for payment transactions
