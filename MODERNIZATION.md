# EMV Library Modernization Guide (2025)

This document outlines the plan for modernizing the EMV library to TypeScript with current best practices for 2025.

## Primary Goals

1. **Migrate to TypeScript** - Full type safety with strict mode
2. **Replace deprecated `card-reader`** - Migrate to `smartcard` package
3. **Modern tooling** - ESM-first, tsup build, Vitest testing

---

## Table of Contents

1. [TypeScript Migration](#1-typescript-migration)
2. [Dependency Migration: card-reader to smartcard](#2-dependency-migration-card-reader-to-smartcard)
3. [Project Structure](#3-project-structure)
4. [Build & Tooling](#4-build--tooling)
5. [Package Configuration](#5-package-configuration)
6. [Code Quality & Linting](#6-code-quality--linting)
7. [Testing](#7-testing)
8. [CI/CD](#8-cicd)
9. [Documentation](#9-documentation)
10. [Security](#10-security)
11. [API Improvements](#11-api-improvements)
12. [Bug Fixes](#12-bug-fixes)
13. [Migration Path](#13-migration-path)

---

## 1. TypeScript Migration

### Current State

- ES6 JavaScript with Babel transpilation
- No type definitions or JSDoc annotations
- Mixed ES6 imports with CommonJS exports

### Target State

- Full TypeScript with strict mode
- ESM-first with CJS build output
- Complete type definitions published to npm

### TypeScript Configuration

```json
// tsconfig.json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "lib": ["ES2022"],
        "outDir": "./dist",
        "rootDir": "./src",
        "strict": true,
        "strictNullChecks": true,
        "strictFunctionTypes": true,
        "strictBindCallApply": true,
        "strictPropertyInitialization": true,
        "noImplicitAny": true,
        "noImplicitReturns": true,
        "noImplicitThis": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noFallthroughCasesInSwitch": true,
        "noUncheckedIndexedAccess": true,
        "exactOptionalPropertyTypes": true,
        "declaration": true,
        "declarationMap": true,
        "sourceMap": true,
        "esModuleInterop": true,
        "forceConsistentCasingInFileNames": true,
        "skipLibCheck": true,
        "resolveJsonModule": true,
        "isolatedModules": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Type Definitions

Create a dedicated types file for shared interfaces:

```typescript
// src/types.ts
import type { Device, Card } from 'smartcard';

/**
 * Response from an EMV card command
 */
export interface CardResponse {
    /** Raw response buffer */
    buffer: Buffer;
    /** Check if the response indicates success (SW1=0x90, SW2=0x00) */
    isOk(): boolean;
    /** Status word 1 */
    sw1: number;
    /** Status word 2 */
    sw2: number;
}

/**
 * Parsed TLV (Tag-Length-Value) data structure
 */
export interface TlvData {
    /** EMV tag number */
    tag: number;
    /** Tag value - either raw bytes or nested TLV structures */
    value: Buffer | TlvData[];
}

/**
 * EMV application information
 */
export interface EmvApplicationInfo {
    /** Application Identifier (AID) */
    aid: Buffer;
    /** Human-readable application label */
    label: string;
    /** Application priority (lower = higher priority) */
    priority: number;
}

/**
 * EMV tag code (hex string like '4F', '5A', '9F26')
 */
export type EmvTagCode = keyof typeof EMV_TAGS;

/**
 * EMV tag name (like 'APP_IDENTIFIER', 'PAN')
 */
export type EmvTagName = (typeof EMV_TAGS)[EmvTagCode];

// Re-export smartcard types for convenience
export type { Device, Card };
```

### Source Files

**src/emv-tags.ts** - Complete typed EMV tag definitions:

```typescript
// src/emv-tags.ts
import tlv from 'tlv';
import type { CardResponse, TlvData } from './types.js';

/**
 * EMV tag dictionary mapping hex codes to human-readable names.
 * Based on EMV Book 3 specification.
 */
export const EMV_TAGS = {
    '4F': 'APP_IDENTIFIER',
    '50': 'APP_LABEL',
    '57': 'TRACK_2',
    '5A': 'PAN',
    '5F20': 'CARDHOLDER_NAME',
    '5F24': 'APP_EXPIRY',
    '5F25': 'APP_EFFECTIVE',
    '5F28': 'ISSUER_COUNTRY_CODE',
    '5F2A': 'TRANSACTION_CURRENCY_CODE',
    '5F2D': 'LANGUAGE_PREFERENCE',
    '5F30': 'SERVICE_CODE',
    '5F34': 'PAN_SEQUENCE_NUMBER',
    '5F36': 'TRANSACTION_CURRENCY_EXPONENT',
    '5F50': 'ISSUER_URL',
    '61': 'APPLICATION_TEMPLATE',
    '6F': 'FILE_CONTROL_INFO',
    '70': 'EMV_APP_ELEMENTARY_FILE',
    '71': 'ISSUER_SCRIPT_TEMPLATE_1',
    '72': 'ISSUER_SCRIPT_TEMPLATE_2',
    '77': 'RESPONSE_TEMPLATE_2',
    '80': 'RESPONSE_TEMPLATE_1',
    '81': 'AUTH_AMOUNT_BIN',
    '82': 'APP_INTERCHANGE_PROFILE',
    '83': 'COMMAND_TEMPLATE',
    '84': 'DEDICATED_FILE_NAME',
    '86': 'ISSUER_SCRIPT_CMD',
    '87': 'APP_PRIORITY',
    '88': 'SFI',
    '89': 'AUTH_IDENTIFICATION_RESPONSE',
    '8A': 'AUTH_RESPONSE_CODE',
    '8C': 'CDOL_1',
    '8D': 'CDOL_2',
    '8E': 'CVM_LIST',
    '8F': 'CA_PK_INDEX',
    '90': 'ISSUER_PK_CERTIFICATE',
    '91': 'ISSUER_AUTH_DATA',
    '92': 'ISSUER_PK_REMAINDER',
    '93': 'SIGNED_STATIC_APPLICATION_DATA',
    '94': 'APP_FILE_LOCATOR',
    '95': 'TERMINAL_VERIFICATION_RESULTS',
    '98': 'TC_HASH_VALUE',
    '99': 'TRANSACTION_PIN_DATA',
    '9A': 'TRANSACTION_DATE',
    '9B': 'TRANSACTION_STATUS_INFORMATION',
    '9C': 'TRANSACTION_TYPE',
    '9D': 'DIRECTORY_DEFINITION_FILE',
    '9F01': 'ACQUIRER_ID',
    '9F02': 'AUTH_AMOUNT_NUM',
    '9F03': 'OTHER_AMOUNT_NUM',
    '9F04': 'OTHER_AMOUNT_BIN',
    '9F05': 'APP_DISCRETIONARY_DATA',
    '9F06': 'AID_TERMINAL',
    '9F07': 'APP_USAGE_CONTROL',
    '9F08': 'APP_VERSION_NUMBER',
    '9F09': 'APP_VERSION_NUMBER_TERMINAL',
    '9F0D': 'IAC_DEFAULT',
    '9F0E': 'IAC_DENIAL',
    '9F0F': 'IAC_ONLINE',
    '9F10': 'ISSUER_APPLICATION_DATA',
    '9F11': 'ISSUER_CODE_TABLE_IDX',
    '9F12': 'APP_PREFERRED_NAME',
    '9F13': 'LAST_ONLINE_ATC',
    '9F14': 'LOWER_OFFLINE_LIMIT',
    '9F15': 'MERCHANT_CATEGORY_CODE',
    '9F16': 'MERCHANT_ID',
    '9F17': 'PIN_TRY_COUNT',
    '9F18': 'ISSUER_SCRIPT_ID',
    '9F1A': 'TERMINAL_COUNTRY_CODE',
    '9F1B': 'TERMINAL_FLOOR_LIMIT',
    '9F1C': 'TERMINAL_ID',
    '9F1D': 'TRM_DATA',
    '9F1E': 'IFD_SERIAL_NUM',
    '9F1F': 'TRACK_1_DD',
    '9F21': 'TRANSACTION_TIME',
    '9F22': 'CA_PK_INDEX_TERM',
    '9F23': 'UPPER_OFFLINE_LIMIT',
    '9F26': 'APPLICATION_CRYPTOGRAM',
    '9F27': 'CRYPTOGRAM_INFORMATION_DATA',
    '9F2D': 'ICC_PIN_ENCIPHERMENT_PK_CERT',
    '9F32': 'ISSUER_PK_EXPONENT',
    '9F33': 'TERMINAL_CAPABILITIES',
    '9F34': 'CVM_RESULTS',
    '9F35': 'APP_TERMINAL_TYPE',
    '9F36': 'APP_TRANSACTION_COUNTER',
    '9F37': 'APP_UNPREDICTABLE_NUMBER',
    '9F38': 'ICC_PDOL',
    '9F39': 'POS_ENTRY_MODE',
    '9F3A': 'AMOUNT_REF_CURRENCY',
    '9F3B': 'APP_REF_CURRENCY',
    '9F3C': 'TRANSACTION_REF_CURRENCY_CODE',
    '9F3D': 'TRANSACTION_REF_CURRENCY_EXPONENT',
    '9F40': 'ADDITIONAL_TERMINAL_CAPABILITIES',
    '9F41': 'TRANSACTION_SEQUENCE_COUNTER',
    '9F42': 'APP_CURRENCY_CODE',
    '9F43': 'APP_REF_CURRENCY_EXPONENT',
    '9F44': 'APP_CURRENCY_EXPONENT',
    '9F45': 'DATA_AUTH_CODE',
    '9F46': 'ICC_PK_CERTIFICATE',
    '9F47': 'ICC_PK_EXPONENT',
    '9F48': 'ICC_PK_REMAINDER',
    '9F49': 'DDOL',
    '9F4A': 'STATIC_DATA_AUTHENTICATION_TAG_LIST',
    '9F4C': 'ICC_DYNAMIC_NUMBER',
    A5: 'FCI_TEMPLATE',
    BF0C: 'FCI_ISSUER_DD',
} as const;

/**
 * Format a card response as a human-readable string
 */
export function format(response: CardResponse): string {
    const parsed = tlv.parse(response.buffer) as TlvData;
    return formatTlvData(parsed);
}

/**
 * Find a specific tag in a card response
 * @param response - The card response to search
 * @param tag - The tag number to find (e.g., 0x4F for APP_IDENTIFIER)
 * @returns The tag value as a Buffer, or undefined if not found
 */
export function findTag(response: CardResponse, tag: number): Buffer | undefined {
    const parsed = tlv.parse(response.buffer) as TlvData;
    return findInTlv(parsed, tag);
}

/**
 * Get the human-readable name for an EMV tag
 */
export function getTagName(tag: number): string {
    const tagHex = tag.toString(16).toUpperCase();
    return EMV_TAGS[tagHex as keyof typeof EMV_TAGS] ?? `UNKNOWN_${tagHex}`;
}

function formatTlvData(data: TlvData, indent = 0): string {
    const tagHex = data.tag.toString(16).toUpperCase();
    const tagName = getTagName(data.tag);
    const prefix = '  '.repeat(indent);

    let result = `${prefix}${tagHex} (${tagName})`;

    if (Buffer.isBuffer(data.value)) {
        const hex = data.value.toString('hex').toUpperCase();
        const ascii = data.value.toString().replace(/[^\x20-\x7E]/g, '.');
        result += `: ${hex} [${ascii}]\n`;
    } else if (Array.isArray(data.value)) {
        result += ':\n';
        for (const child of data.value) {
            result += formatTlvData(child, indent + 1);
        }
    }

    return result;
}

function findInTlv(data: TlvData, tag: number): Buffer | undefined {
    if (data.tag === tag) {
        return Buffer.isBuffer(data.value) ? data.value : undefined;
    }

    if (Array.isArray(data.value)) {
        for (const child of data.value) {
            const result = findInTlv(child, tag);
            if (result !== undefined) {
                return result;
            }
        }
    }

    return undefined;
}
```

**src/emv-application.ts** - Main application class:

````typescript
// src/emv-application.ts
import type { Device, Card } from 'smartcard';
import iso7816 from 'iso7816';
import type { CardResponse, EmvApplicationInfo } from './types.js';
import { findTag } from './emv-tags.js';

/**
 * Payment System Environment (PSE) identifier
 * "1PAY.SYS.DDF01" encoded as bytes
 */
const PSE = Buffer.from([
    0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e, 0x44, 0x44, 0x46, 0x30, 0x31,
]);

/**
 * EMV Application for interacting with chip cards via PC/SC readers.
 *
 * @example
 * ```typescript
 * import { Devices } from 'smartcard';
 * import { EmvApplication } from 'emv';
 *
 * const devices = new Devices();
 * devices.on('device-activated', ({ device }) => {
 *   device.on('card-inserted', async ({ card }) => {
 *     const emv = new EmvApplication(device, card);
 *     const apps = await emv.getApplications();
 *     console.log('Available applications:', apps);
 *   });
 * });
 * ```
 */
export class EmvApplication {
    readonly #iso7816: ReturnType<typeof iso7816>;
    readonly #device: Device;
    readonly #card: Card;

    constructor(device: Device, card: Card) {
        this.#device = device;
        this.#card = card;
        this.#iso7816 = iso7816(device, card);
    }

    /**
     * Select the Payment System Environment (PSE) directory.
     * This is typically the first command sent to a payment card.
     */
    async selectPse(): Promise<CardResponse> {
        return this.#iso7816.selectFile(PSE);
    }

    /**
     * Select an EMV application by its AID.
     * @param aid - Application Identifier (5-16 bytes)
     */
    async selectApplication(aid: Buffer | readonly number[]): Promise<CardResponse> {
        const aidBuffer = Buffer.isBuffer(aid) ? aid : Buffer.from(aid);

        if (aidBuffer.length < 5 || aidBuffer.length > 16) {
            throw new RangeError('AID must be between 5 and 16 bytes');
        }

        return this.#iso7816.selectFile(aidBuffer);
    }

    /**
     * Read a record from a Short File Identifier (SFI).
     * @param sfi - Short File Identifier (1-30)
     * @param record - Record number (0-255)
     */
    async readRecord(sfi: number, record: number): Promise<CardResponse> {
        if (!Number.isInteger(sfi) || sfi < 1 || sfi > 30) {
            throw new RangeError('SFI must be an integer between 1 and 30');
        }

        if (!Number.isInteger(record) || record < 0 || record > 255) {
            throw new RangeError('Record number must be an integer between 0 and 255');
        }

        return this.#iso7816.readRecord(sfi, record);
    }

    /**
     * Get all available payment applications on the card.
     * Automatically selects PSE and reads all application records.
     */
    async getApplications(): Promise<EmvApplicationInfo[]> {
        const pseResponse = await this.selectPse();

        if (!pseResponse.isOk()) {
            throw new Error(
                `Failed to select PSE: SW=${pseResponse.sw1.toString(16)}${pseResponse.sw2.toString(16)}`
            );
        }

        const sfiBuffer = findTag(pseResponse, 0x88);
        if (!sfiBuffer) {
            throw new Error('SFI tag (0x88) not found in PSE response');
        }

        const sfi = sfiBuffer[0];
        if (sfi === undefined) {
            throw new Error('Invalid SFI value');
        }

        const applications: EmvApplicationInfo[] = [];

        for (let record = 1; record <= 10; record++) {
            try {
                const response = await this.readRecord(sfi, record);

                if (!response.isOk()) {
                    break;
                }

                const aid = findTag(response, 0x4f);
                if (aid) {
                    const label = findTag(response, 0x50);
                    const priority = findTag(response, 0x87);

                    applications.push({
                        aid,
                        label: label?.toString('utf8') ?? 'Unknown',
                        priority: priority?.[0] ?? 255,
                    });
                }
            } catch {
                break;
            }
        }

        return applications.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Get the card's ATR (Answer To Reset)
     */
    getAtr(): string {
        return this.#card.getAtr();
    }

    /**
     * Get the device name
     */
    getDeviceName(): string {
        return this.#device.name;
    }
}

/**
 * Factory function to create an EmvApplication instance
 */
export function createEmvApplication(device: Device, card: Card): EmvApplication {
    return new EmvApplication(device, card);
}

export default createEmvApplication;
````

**src/index.ts** - Main entry point with all exports:

```typescript
// src/index.ts
export { EmvApplication, createEmvApplication, default } from './emv-application.js';
export { EMV_TAGS, format, findTag, getTagName } from './emv-tags.js';
export type {
    CardResponse,
    TlvData,
    EmvApplicationInfo,
    EmvTagCode,
    EmvTagName,
    Device,
    Card,
} from './types.js';
```

---

## 2. Dependency Migration: card-reader to smartcard

### Current State

- Uses deprecated `card-reader` package
- API is tightly coupled to `card-reader` event model

### Background

The `card-reader` package is deprecated. The `smartcard` package is the recommended replacement and provides a more modern API with better TypeScript support.

### Migration Steps

**1. Update package.json:**

```diff
  "dependencies": {
-   "card-reader": "^1.0.5",
+   "smartcard": "^1.0.0",
-   "hexify": "^1.0.4",
    "iso7816": "^1.0.20",
    "tlv": "^1.1.1"
  }
```

**2. Key API differences:**

| card-reader                        | smartcard                         |
| ---------------------------------- | --------------------------------- |
| `devices.on('card-inserted', ...)` | `device.on('card-inserted', ...)` |
| `event.reader`                     | `device` (from device-activated)  |
| `event.status.atr`                 | `card.getAtr()`                   |
| `event.reader.name`                | `device.name`                     |
| Global event emitter               | Per-device event emitter          |

**3. Updated demo (TypeScript):**

```typescript
// examples/demo.ts
import { Devices } from 'smartcard';
import { EmvApplication, format, findTag } from '../src/index.js';

const devices = new Devices();

devices.on('device-activated', ({ device }) => {
    console.log(`Device '${device.name}' activated`);

    device.on('card-inserted', async ({ card }) => {
        console.log(`Card inserted, ATR: ${card.getAtr()}`);

        const emv = new EmvApplication(device, card);

        try {
            // Get all available applications
            const apps = await emv.getApplications();
            console.log('Available applications:');

            for (const app of apps) {
                console.log(`  - ${app.label} (AID: ${app.aid.toString('hex')})`);
            }

            // Select first application if available
            if (apps[0]) {
                const response = await emv.selectApplication(apps[0].aid);
                console.log('Selected application:', format(response));
            }
        } catch (error) {
            console.error('EMV Error:', error);
        }
    });

    device.on('card-removed', () => {
        console.log(`Card removed from '${device.name}'`);
    });
});

devices.on('device-deactivated', ({ device }) => {
    console.log(`Device '${device.name}' deactivated`);
});

devices.on('error', ({ error }) => {
    console.error('Device error:', error);
});

console.log('Waiting for card reader...');
```

**4. Benefits of smartcard:**

- Active maintenance
- Built-in TypeScript definitions
- Per-device event handling
- Cleaner separation of Device and Card concepts
- Promise-based card communication API

---

## 3. Project Structure

```
emv/
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   └── dependabot.yml
├── src/
│   ├── index.ts              # Main entry, re-exports everything
│   ├── emv-application.ts    # EmvApplication class
│   ├── emv-tags.ts           # EMV tag definitions and utilities
│   └── types.ts              # TypeScript interfaces
├── tests/
│   ├── emv-application.test.ts
│   └── emv-tags.test.ts
├── examples/
│   └── demo.ts               # Working example
├── dist/                     # Build output (gitignored)
│   ├── index.js
│   ├── index.d.ts
│   ├── index.cjs
│   └── ...
├── .gitignore
├── .nvmrc
├── .prettierrc
├── CHANGELOG.md
├── eslint.config.js
├── LICENSE
├── package.json
├── README.md
├── SECURITY.md
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

---

## 4. Build & Tooling

### Use tsup for building

tsup is a TypeScript-native bundler that handles ESM/CJS dual builds with declaration files:

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node18',
    splitting: false,
    outExtension({ format }) {
        return {
            js: format === 'cjs' ? '.cjs' : '.js',
        };
    },
});
```

### Package scripts

```json
{
    "scripts": {
        "build": "tsup",
        "dev": "tsup --watch",
        "typecheck": "tsc --noEmit",
        "lint": "eslint src/ tests/",
        "lint:fix": "eslint src/ tests/ --fix",
        "format": "prettier --write .",
        "format:check": "prettier --check .",
        "test": "vitest run",
        "test:watch": "vitest",
        "test:coverage": "vitest run --coverage",
        "prepublishOnly": "npm run lint && npm run typecheck && npm run test && npm run build"
    }
}
```

---

## 5. Package Configuration

### Complete package.json

```json
{
    "name": "emv",
    "version": "2.0.0",
    "description": "EMV / Chip and PIN library for PC/SC card readers",
    "type": "module",
    "exports": {
        ".": {
            "import": {
                "types": "./dist/index.d.ts",
                "default": "./dist/index.js"
            },
            "require": {
                "types": "./dist/index.d.cts",
                "default": "./dist/index.cjs"
            }
        }
    },
    "main": "./dist/index.cjs",
    "module": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "files": ["dist"],
    "engines": {
        "node": ">=18.0.0"
    },
    "scripts": {
        "build": "tsup",
        "dev": "tsup --watch",
        "typecheck": "tsc --noEmit",
        "lint": "eslint src/ tests/",
        "lint:fix": "eslint src/ tests/ --fix",
        "format": "prettier --write .",
        "test": "vitest run",
        "test:watch": "vitest",
        "test:coverage": "vitest run --coverage",
        "prepublishOnly": "npm run lint && npm run typecheck && npm run test && npm run build"
    },
    "keywords": [
        "pcsc",
        "smartcard",
        "smart-card",
        "iso7816",
        "chip-and-pin",
        "emv",
        "payment",
        "nfc",
        "contactless",
        "typescript"
    ],
    "author": "tomkp <tom@tomkp.com>",
    "license": "MIT",
    "repository": {
        "type": "git",
        "url": "https://github.com/tomkp/emv.git"
    },
    "bugs": {
        "url": "https://github.com/tomkp/emv/issues"
    },
    "homepage": "https://github.com/tomkp/emv#readme",
    "dependencies": {
        "smartcard": "^1.0.0",
        "iso7816": "^1.0.20",
        "tlv": "^1.1.1"
    },
    "devDependencies": {
        "@types/node": "^22.0.0",
        "@vitest/coverage-v8": "^2.0.0",
        "eslint": "^9.0.0",
        "prettier": "^3.0.0",
        "tsup": "^8.0.0",
        "typescript": "^5.6.0",
        "typescript-eslint": "^8.0.0",
        "vitest": "^2.0.0"
    }
}
```

### .nvmrc

```
22
```

### .gitignore

```
node_modules/
dist/
coverage/
*.log
.DS_Store
*.tgz
```

---

## 6. Code Quality & Linting

### ESLint with TypeScript

```javascript
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'error',
            '@typescript-eslint/no-unused-vars': 'error',
            '@typescript-eslint/strict-boolean-expressions': 'warn',
            '@typescript-eslint/no-floating-promises': 'error',
        },
    },
    {
        ignores: ['dist/', 'coverage/', '*.config.*'],
    }
);
```

### Prettier

```json
// .prettierrc
{
    "semi": true,
    "singleQuote": true,
    "trailingComma": "es5",
    "printWidth": 100,
    "tabWidth": 2
}
```

---

## 7. Testing

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.d.ts', 'src/types.ts'],
            thresholds: {
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80,
            },
        },
    },
});
```

### Test Files

```typescript
// tests/emv-tags.test.ts
import { describe, it, expect } from 'vitest';
import { EMV_TAGS, format, findTag, getTagName } from '../src/emv-tags.js';
import type { CardResponse } from '../src/types.js';

function createMockResponse(buffer: Buffer): CardResponse {
    return {
        buffer,
        isOk: () => true,
        sw1: 0x90,
        sw2: 0x00,
    };
}

describe('EMV_TAGS', () => {
    it('should have correct tag definitions', () => {
        expect(EMV_TAGS['4F']).toBe('APP_IDENTIFIER');
        expect(EMV_TAGS['5A']).toBe('PAN');
        expect(EMV_TAGS['5F20']).toBe('CARDHOLDER_NAME');
    });

    it('should include all standard EMV tags', () => {
        const requiredTags = ['4F', '50', '5A', '5F20', '5F24', '9F26'];
        for (const tag of requiredTags) {
            expect(EMV_TAGS).toHaveProperty(tag);
        }
    });

    it('should have fixed typos from original implementation', () => {
        expect(EMV_TAGS['6F']).toBe('FILE_CONTROL_INFO');
        expect(EMV_TAGS['9B']).toBe('TRANSACTION_STATUS_INFORMATION');
        expect(EMV_TAGS['9F27']).toBe('CRYPTOGRAM_INFORMATION_DATA');
        expect(EMV_TAGS['9F37']).toBe('APP_UNPREDICTABLE_NUMBER');
    });
});

describe('getTagName', () => {
    it('should return tag name for known tags', () => {
        expect(getTagName(0x4f)).toBe('APP_IDENTIFIER');
        expect(getTagName(0x50)).toBe('APP_LABEL');
    });

    it('should return UNKNOWN_XX for unknown tags', () => {
        expect(getTagName(0xff)).toBe('UNKNOWN_FF');
    });
});

describe('findTag', () => {
    it('should find a tag in a TLV structure', () => {
        const response = createMockResponse(
            Buffer.from([0x4f, 0x07, 0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10])
        );
        const result = findTag(response, 0x4f);
        expect(result).toBeInstanceOf(Buffer);
        expect(result?.toString('hex')).toBe('a0000000041010');
    });

    it('should return undefined for non-existent tags', () => {
        const response = createMockResponse(Buffer.from([0x50, 0x04, 0x56, 0x49, 0x53, 0x41]));
        const result = findTag(response, 0x9999);
        expect(result).toBeUndefined();
    });
});

describe('format', () => {
    it('should format TLV data as readable string', () => {
        const response = createMockResponse(Buffer.from([0x50, 0x04, 0x56, 0x49, 0x53, 0x41]));
        const result = format(response);
        expect(result).toContain('APP_LABEL');
    });
});
```

```typescript
// tests/emv-application.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Device, Card } from 'smartcard';

// Mock iso7816 before importing EmvApplication
vi.mock('iso7816', () => ({
    default: vi.fn(() => ({
        selectFile: vi.fn().mockResolvedValue({
            buffer: Buffer.from([0x6f, 0x00]),
            isOk: () => true,
            sw1: 0x90,
            sw2: 0x00,
        }),
        readRecord: vi.fn().mockResolvedValue({
            buffer: Buffer.from([]),
            isOk: () => false,
            sw1: 0x6a,
            sw2: 0x83,
        }),
    })),
}));

import { EmvApplication } from '../src/emv-application.js';

describe('EmvApplication', () => {
    let emv: EmvApplication;
    let mockDevice: Device;
    let mockCard: Card;

    beforeEach(() => {
        mockDevice = { name: 'Test Reader' } as Device;
        mockCard = { getAtr: () => '3B8F8001804F0CA0000003060B00000000000061' } as Card;
        emv = new EmvApplication(mockDevice, mockCard);
    });

    describe('constructor', () => {
        it('should create an instance', () => {
            expect(emv).toBeInstanceOf(EmvApplication);
        });

        it('should expose device name', () => {
            expect(emv.getDeviceName()).toBe('Test Reader');
        });

        it('should expose card ATR', () => {
            expect(emv.getAtr()).toBe('3B8F8001804F0CA0000003060B00000000000061');
        });
    });

    describe('selectApplication', () => {
        it('should throw RangeError for AID shorter than 5 bytes', async () => {
            await expect(emv.selectApplication([0xa0, 0x00, 0x00, 0x00])).rejects.toThrow(
                RangeError
            );
        });

        it('should throw RangeError for AID longer than 16 bytes', async () => {
            const longAid = new Array(17).fill(0xa0);
            await expect(emv.selectApplication(longAid)).rejects.toThrow(RangeError);
        });

        it('should accept valid AID buffer', async () => {
            const aid = Buffer.from([0xa0, 0x00, 0x00, 0x00, 0x04, 0x10, 0x10]);
            await expect(emv.selectApplication(aid)).resolves.toBeDefined();
        });
    });

    describe('readRecord', () => {
        it('should throw RangeError for SFI less than 1', async () => {
            await expect(emv.readRecord(0, 1)).rejects.toThrow(RangeError);
        });

        it('should throw RangeError for SFI greater than 30', async () => {
            await expect(emv.readRecord(31, 1)).rejects.toThrow(RangeError);
        });

        it('should throw RangeError for negative record number', async () => {
            await expect(emv.readRecord(1, -1)).rejects.toThrow(RangeError);
        });

        it('should throw RangeError for record number greater than 255', async () => {
            await expect(emv.readRecord(1, 256)).rejects.toThrow(RangeError);
        });

        it('should throw RangeError for non-integer SFI', async () => {
            await expect(emv.readRecord(1.5, 1)).rejects.toThrow(RangeError);
        });
    });
});
```

---

## 8. CI/CD

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
    push:
        branches: [main, master]
    pull_request:
        branches: [main, master]

jobs:
    test:
        runs-on: ubuntu-latest
        strategy:
            matrix:
                node-version: [18, 20, 22]

        steps:
            - uses: actions/checkout@v4

            - name: Setup Node.js ${{ matrix.node-version }}
              uses: actions/setup-node@v4
              with:
                  node-version: ${{ matrix.node-version }}
                  cache: 'npm'

            - name: Install dependencies
              run: npm ci

            - name: Lint
              run: npm run lint

            - name: Type check
              run: npm run typecheck

            - name: Test
              run: npm run test:coverage

            - name: Build
              run: npm run build

            - name: Upload coverage
              uses: codecov/codecov-action@v4
              with:
                  file: ./coverage/lcov.info

    publish:
        needs: test
        runs-on: ubuntu-latest
        if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/master'

        steps:
            - uses: actions/checkout@v4

            - uses: actions/setup-node@v4
              with:
                  node-version: 20
                  registry-url: 'https://registry.npmjs.org'

            - run: npm ci
            - run: npm run build

            - name: Publish
              run: npm publish --access public
              env:
                  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
              if: github.event_name == 'push'
```

**Dependabot for dependency updates:**

```yaml
# .github/dependabot.yml
version: 2
updates:
    - package-ecosystem: 'npm'
      directory: '/'
      schedule:
          interval: 'weekly'
      open-pull-requests-limit: 10
      groups:
          dev-dependencies:
              patterns:
                  - '*'
              exclude-patterns:
                  - 'smartcard'
                  - 'iso7816'
                  - 'tlv'
```

---

## 9. Documentation

### README Updates

The README should be updated to reflect the TypeScript migration and new API:

```typescript
// Example usage in README
import { Devices } from 'smartcard';
import { EmvApplication, format } from 'emv';

const devices = new Devices();

devices.on('device-activated', ({ device }) => {
    device.on('card-inserted', async ({ card }) => {
        const emv = new EmvApplication(device, card);

        // List all applications on the card
        const apps = await emv.getApplications();
        for (const app of apps) {
            console.log(`${app.label}: ${app.aid.toString('hex')}`);
        }

        // Select and interact with first application
        if (apps[0]) {
            const response = await emv.selectApplication(apps[0].aid);
            console.log(format(response));
        }
    });
});
```

### TypeDoc for API Documentation

```json
// typedoc.json
{
    "entryPoints": ["src/index.ts"],
    "out": "docs/api",
    "plugin": ["typedoc-plugin-markdown"],
    "readme": "none",
    "excludePrivate": true
}
```

Add to devDependencies:

```json
"typedoc": "^0.26.0",
"typedoc-plugin-markdown": "^4.0.0"
```

Add script:

```json
"docs": "typedoc"
```

---

## 10. Security

### SECURITY.md

```markdown
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :x:                |

## Reporting a Vulnerability

Please report security vulnerabilities by emailing security@example.com.

Do not open public issues for security vulnerabilities.

## Security Considerations

This library reads sensitive payment card data including:

- Primary Account Number (PAN)
- Cardholder name
- Card expiration date
- Track 2 equivalent data

Users of this library must:

- Comply with PCI-DSS requirements
- Ensure proper authorization for card reading
- Implement appropriate data protection measures
- Not store sensitive cardholder data unnecessarily
```

**Add input validation:**

```typescript
export class EmvApplication {
    async selectApplication(aid: Buffer | number[]): Promise<CardResponse> {
        // Validate AID
        if (!aid) {
            throw new TypeError('AID is required');
        }

        const aidBuffer = Buffer.isBuffer(aid) ? aid : Buffer.from(aid);

        if (aidBuffer.length < 5 || aidBuffer.length > 16) {
            throw new RangeError('AID must be between 5 and 16 bytes');
        }

        return this.#iso7816.selectFile(aidBuffer);
    }

    async readRecord(sfi: number, record: number): Promise<CardResponse> {
        // Validate SFI (Short File Identifier)
        if (!Number.isInteger(sfi) || sfi < 1 || sfi > 30) {
            throw new RangeError('SFI must be an integer between 1 and 30');
        }

        // Validate record number
        if (!Number.isInteger(record) || record < 0 || record > 255) {
            throw new RangeError('Record number must be an integer between 0 and 255');
        }

        return this.#iso7816.readRecord(sfi, record);
    }
}
```

Add npm audit to CI workflow (already included in section 8).

---

## 11. API Improvements

The new TypeScript implementation (section 1) includes these improvements:

- **Class-based API** with proper encapsulation using private fields
- **`getApplications()` convenience method** - automatically reads all available payment applications
- **Input validation** - throws `RangeError` for invalid SFI/record values, validates AID length
- **Typed responses** - all methods return `Promise<CardResponse>` with proper typing
- **Helper methods** - `getAtr()`, `getDeviceName()` for easy access to card/device info

---

## 12. Bug Fixes

These issues from the current codebase are addressed in the new TypeScript implementation:

| Issue                 | Current                                 | Fixed                                    |
| --------------------- | --------------------------------------- | ---------------------------------------- |
| Typo in tag name      | `'6F': 'FILE_CONTROL_log'`              | `'6F': 'FILE_CONTROL_INFO'`              |
| Typo in tag name      | `'9B': 'TRANSACTION_STATUS_logRMATION'` | `'9B': 'TRANSACTION_STATUS_INFORMATION'` |
| Typo in tag name      | `'9F27': 'CRYPTOGRAM_logRMATION_DATA'`  | `'9F27': 'CRYPTOGRAM_INFORMATION_DATA'`  |
| Typo in tag name      | `'9F37': 'APP_UNPREDICATABLE_NUMBER'`   | `'9F37': 'APP_UNPREDICTABLE_NUMBER'`     |
| Deprecated dependency | `card-reader`                           | `smartcard`                              |
| Unused dependency     | `hexify`                                | Removed                                  |
| Missing export        | `emvTags` not exported                  | `EMV_TAGS` exported                      |
| Unknown tag handling  | Returns `undefined`                     | Returns `UNKNOWN_XX`                     |
| Mixed module syntax   | ES6 import + CJS export                 | Pure ESM                                 |

---

## 13. Migration Path

### Recommended Order of Implementation

**Step 1: Initialize TypeScript project**

```bash
# Create new branch
git checkout -b typescript-migration

# Initialize TypeScript and install dependencies
npm install -D typescript tsup vitest @vitest/coverage-v8 \
  eslint typescript-eslint prettier @types/node

# Replace card-reader with smartcard
npm uninstall card-reader hexify
npm install smartcard
```

**Step 2: Create configuration files**

- `tsconfig.json` (section 1)
- `tsup.config.ts` (section 4)
- `vitest.config.ts` (section 7)
- `eslint.config.js` (section 6)
- `.prettierrc` (section 6)

**Step 3: Create TypeScript source files**

- `src/types.ts` - Type definitions
- `src/emv-tags.ts` - Tag dictionary and utilities
- `src/emv-application.ts` - Main application class
- `src/index.ts` - Public exports

**Step 4: Add tests**

- `tests/emv-tags.test.ts`
- `tests/emv-application.test.ts`

**Step 5: Update package.json**

- Update scripts, exports, type field
- Bump major version to 2.0.0

**Step 6: Add CI/CD**

- `.github/workflows/ci.yml`
- `.github/dependabot.yml`

**Step 7: Update documentation**

- Update README.md with new API
- Add SECURITY.md
- Add CHANGELOG.md

**Step 8: Clean up**

- Remove `src/*.js` files
- Remove `demo/` directory (replace with `examples/`)
- Remove `babel.config.json`
- Update `.gitignore`

---

## Summary

| Area         | Current                    | After Migration                  |
| ------------ | -------------------------- | -------------------------------- |
| Language     | ES6 + Babel                | TypeScript 5.6+                  |
| Modules      | Mixed CJS/ESM              | Pure ESM with CJS build          |
| Runtime      | Unspecified                | Node.js 18+                      |
| Card Reader  | `card-reader` (deprecated) | `smartcard`                      |
| Testing      | None                       | Vitest with 80% coverage         |
| Linting      | None                       | ESLint 9 + typescript-eslint     |
| Formatting   | None                       | Prettier                         |
| Build        | Babel                      | tsup                             |
| CI/CD        | None                       | GitHub Actions                   |
| Types        | None                       | Full TypeScript with strict mode |
| Package Size | ~180 LOC                   | ~400 LOC (with types & tests)    |

This migration transforms the library into a modern, type-safe, well-tested package while maintaining the same core functionality and API design philosophy.
