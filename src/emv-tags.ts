import { parse, type Tlv } from '@tomkp/ber-tlv';
import type { CardResponse } from './types.js';

// ANSI color codes for terminal output
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * Convert tag bytes to a single number for comparison
 */
function tagBytesToNumber(bytes: Uint8Array): number {
    let result = 0;
    for (const byte of bytes) {
        result = (result << 8) | byte;
    }
    return result;
}

/**
 * Tags that contain binary data where ASCII display is not useful
 */
const BINARY_TAGS = new Set([
    0x90, // ISSUER_PK_CERTIFICATE
    0x92, // ISSUER_PK_REMAINDER
    0x93, // SIGNED_STATIC_APPLICATION_DATA
    0x9f46, // ICC_PK_CERTIFICATE
    0x9f48, // ICC_PK_REMAINDER
    0x9f2d, // ICC_PIN_ENCIPHERMENT_PK_CERT
    0x9f4c, // ICC_DYNAMIC_NUMBER
]);

/**
 * Format a PAN with spaces for readability
 */
function formatPan(hex: string): string {
    // Remove any trailing 'F' padding
    const pan = hex.replace(/F+$/i, '');
    // Add spaces every 4 digits
    return pan.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Parse Track 2 equivalent data (tag 57)
 */
function formatTrack2(buffer: Buffer): string {
    const hex = buffer.toString('hex').toUpperCase();
    const separatorIndex = hex.indexOf('D');
    if (separatorIndex === -1) {
        return hex;
    }

    const pan = hex.substring(0, separatorIndex);
    const rest = hex.substring(separatorIndex + 1);
    const expiry = rest.substring(0, 4);
    const serviceCode = rest.substring(4, 7);
    const discretionary = rest.substring(7).replace(/F+$/i, '');

    const expiryFormatted = expiry.length === 4 ? `20${expiry.substring(0, 2)}-${expiry.substring(2, 4)}` : expiry;

    let result = `${hex}\n      ${DIM}PAN: ${formatPan(pan)}`;
    result += `, Exp: ${expiryFormatted}`;
    result += `, Svc: ${serviceCode}`;
    if (discretionary) {
        result += `, DD: ${discretionary}`;
    }
    result += RESET;
    return result;
}

/**
 * Format EMV date (YYMMDD) to readable format
 */
function formatDate(buffer: Buffer): string {
    const hex = buffer.toString('hex').toUpperCase();
    if (hex.length !== 6) return hex;
    const year = `20${hex.substring(0, 2)}`;
    const month = hex.substring(2, 4);
    const day = hex.substring(4, 6);
    return `${hex} ${DIM}(${year}-${month}-${day})${RESET}`;
}

/**
 * Service code digit meanings
 */
const SERVICE_CODE_D1: Record<string, string> = {
    '1': 'International, chip',
    '2': 'International, chip, w/PIN',
    '5': 'National, chip',
    '6': 'National, chip, w/PIN',
    '7': 'Private',
};

const SERVICE_CODE_D2: Record<string, string> = {
    '0': 'Normal',
    '2': 'Positive auth (contact issuer)',
    '4': 'Positive auth (contact issuer, exceptions)',
};

const SERVICE_CODE_D3: Record<string, string> = {
    '0': 'No restrictions, PIN required',
    '1': 'No restrictions',
    '2': 'Goods/services only',
    '3': 'ATM only, PIN required',
    '4': 'Cash only',
    '5': 'Goods/services only, PIN required',
    '6': 'No restrictions, PIN prompt',
    '7': 'Goods/services only, PIN prompt',
};

/**
 * Format service code with meaning
 */
function formatServiceCode(buffer: Buffer): string {
    const hex = buffer.toString('hex').toUpperCase();
    if (hex.length < 3) return hex;

    const d1 = hex[0]!;
    const d2 = hex[1]!;
    const d3 = hex[2]!;

    const meanings: string[] = [];

    const m1 = SERVICE_CODE_D1[d1];
    const m2 = SERVICE_CODE_D2[d2];
    const m3 = SERVICE_CODE_D3[d3];
    if (m1) meanings.push(m1);
    if (m2) meanings.push(m2);
    if (m3) meanings.push(m3);

    if (meanings.length > 0) {
        return `${hex} ${DIM}(${meanings.join(', ')})${RESET}`;
    }
    return hex;
}

/**
 * CVM (Cardholder Verification Method) codes
 */
const CVM_CODES: Record<number, string> = {
    0x00: 'Fail CVM',
    0x01: 'Plaintext PIN by ICC',
    0x02: 'Enciphered PIN online',
    0x03: 'Plaintext PIN by ICC + signature',
    0x04: 'Enciphered PIN by ICC',
    0x05: 'Enciphered PIN by ICC + signature',
    0x1e: 'Signature',
    0x1f: 'No CVM required',
    0x3f: 'No CVM required (amount)',
};

const CVM_CONDITIONS: Record<number, string> = {
    0x00: 'Always',
    0x01: 'If unattended cash',
    0x02: 'If not unattended cash/manual/PIN',
    0x03: 'If terminal supports CVM',
    0x04: 'If manual cash',
    0x05: 'If purchase with cashback',
    0x06: 'If transaction in app currency & under X',
    0x07: 'If transaction in app currency & over X',
    0x08: 'If transaction in app currency & under Y',
    0x09: 'If transaction in app currency & over Y',
};

/**
 * Format CVM list
 */
function formatCvmList(buffer: Buffer): string {
    const hex = buffer.toString('hex').toUpperCase();
    if (buffer.length < 8) {
        return hex;
    }

    const amountX = buffer.readUInt32BE(0);
    const amountY = buffer.readUInt32BE(4);
    const rules: string[] = [];

    for (let i = 8; i + 1 < buffer.length; i += 2) {
        const cvmByte = buffer[i]!;
        const condByte = buffer[i + 1]!;
        const cvmCode = cvmByte & 0x3f;
        const failIfUnsuccessful = (cvmByte & 0x40) === 0;

        const cvmName = CVM_CODES[cvmCode] || `Unknown(${cvmCode.toString(16)})`;
        const condName = CVM_CONDITIONS[condByte] || `Cond(${condByte.toString(16)})`;
        const failStr = failIfUnsuccessful ? '' : ' [continue if fails]';
        const ruleHex = cvmByte.toString(16).padStart(2, '0').toUpperCase() +
            condByte.toString(16).padStart(2, '0').toUpperCase();

        rules.push(`${ruleHex} ${DIM}${cvmName} ${condName}${failStr}${RESET}`);
    }

    let result = hex;
    if (rules.length > 0) {
        const amountInfo = [];
        if (amountX > 0) amountInfo.push(`X=${amountX}`);
        if (amountY > 0) amountInfo.push(`Y=${amountY}`);
        if (amountInfo.length > 0) {
            result += ` ${DIM}(${amountInfo.join(', ')})${RESET}`;
        }
        result += '\n      ' + rules.join('\n      ');
    }
    return result;
}

/**
 * Application Usage Control (AUC) bit meanings
 */
const AUC_BITS: Array<[number, number, string]> = [
    [0, 0x80, 'Domestic cash'],
    [0, 0x40, 'International cash'],
    [0, 0x20, 'Domestic goods'],
    [0, 0x10, 'International goods'],
    [0, 0x08, 'Domestic services'],
    [0, 0x04, 'International services'],
    [0, 0x02, 'ATMs'],
    [0, 0x01, 'Non-ATM terminals'],
    [1, 0x80, 'Domestic cashback'],
    [1, 0x40, 'International cashback'],
];

/**
 * Format AUC flags
 */
function formatAuc(buffer: Buffer): string {
    const enabled: string[] = [];
    for (const [byteIdx, mask, name] of AUC_BITS) {
        const byte = buffer[byteIdx];
        if (byte !== undefined && (byte & mask)) {
            enabled.push(name);
        }
    }
    const hex = buffer.toString('hex').toUpperCase();
    if (enabled.length === 0) return hex;
    return `${hex} ${DIM}(${enabled.join(', ')})${RESET}`;
}

/**
 * Issuer Action Code (IAC) / Terminal Verification Results (TVR) bit meanings
 */
const TVR_BITS: Array<[number, number, string]> = [
    [0, 0x80, 'Offline data auth not performed'],
    [0, 0x40, 'SDA failed'],
    [0, 0x20, 'ICC data missing'],
    [0, 0x10, 'Card on exception file'],
    [0, 0x08, 'DDA failed'],
    [0, 0x04, 'CDA failed'],
    [1, 0x80, 'ICC & terminal versions differ'],
    [1, 0x40, 'Expired app'],
    [1, 0x20, 'App not yet effective'],
    [1, 0x10, 'Service not allowed'],
    [1, 0x08, 'New card'],
    [2, 0x80, 'CVM not successful'],
    [2, 0x40, 'Unrecognised CVM'],
    [2, 0x20, 'PIN try limit exceeded'],
    [2, 0x10, 'PIN required, pad not present'],
    [2, 0x08, 'PIN required, pad present but PIN not entered'],
    [2, 0x04, 'Online PIN entered'],
    [3, 0x80, 'Transaction exceeds floor limit'],
    [3, 0x40, 'Lower consecutive offline limit exceeded'],
    [3, 0x20, 'Upper consecutive offline limit exceeded'],
    [3, 0x10, 'Random selected for online'],
    [3, 0x08, 'Merchant forced online'],
    [4, 0x80, 'Default TDOL used'],
    [4, 0x40, 'Issuer auth failed'],
    [4, 0x20, 'Script failed before final GAC'],
    [4, 0x10, 'Script failed after final GAC'],
];

/**
 * Format IAC/TVR flags - shows each byte with its set bits
 * For IAC tags, these are masks (conditions to check), not events that occurred
 */
function formatIacTvr(buffer: Buffer): string {
    const hex = buffer.toString('hex').toUpperCase();
    const setBits: string[] = [];

    for (let byteIdx = 0; byteIdx < buffer.length && byteIdx < 5; byteIdx++) {
        const byte = buffer[byteIdx]!;

        for (const [idx, mask, name] of TVR_BITS) {
            if (idx === byteIdx && (byte & mask)) {
                setBits.push(name);
            }
        }
    }

    if (setBits.length === 0) {
        return `${hex} ${DIM}(none set)${RESET}`;
    }
    return `${hex}\n      ${DIM}${setBits.join('\n      ')}${RESET}`;
}

/**
 * Get custom formatter for a specific tag
 */
function getTagFormatter(tagNum: number): ((buffer: Buffer) => string) | undefined {
    switch (tagNum) {
        case 0x57: // TRACK_2
            return formatTrack2;
        case 0x5a: // PAN
            return (buf) => {
                const hex = buf.toString('hex').toUpperCase();
                return `${hex} ${DIM}(${formatPan(hex)})${RESET}`;
            };
        case 0x5f24: // APP_EXPIRY
        case 0x5f25: // APP_EFFECTIVE
            return formatDate;
        case 0x5f30: // SERVICE_CODE
            return formatServiceCode;
        case 0x8e: // CVM_LIST
            return formatCvmList;
        case 0x9f07: // APP_USAGE_CONTROL
            return formatAuc;
        case 0x9f0d: // IAC_DEFAULT
        case 0x9f0e: // IAC_DENIAL
        case 0x9f0f: // IAC_ONLINE
        case 0x95: // TVR
            return formatIacTvr;
        default:
            return undefined;
    }
}

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
 * Get the human-readable name for an EMV tag
 */
export function getTagName(tag: number): string {
    const tagHex = tag.toString(16).toUpperCase();
    if (tagHex in EMV_TAGS) {
        return EMV_TAGS[tagHex as keyof typeof EMV_TAGS];
    }
    return `UNKNOWN_${tagHex}`;
}

function formatTlvData(data: Tlv, indent = 0): string {
    const tagNum = data.tag.bytes ? tagBytesToNumber(data.tag.bytes) : data.tag.number;
    const tagHex = tagNum.toString(16).toUpperCase();
    const tagName = getTagName(tagNum);
    const prefix = '  '.repeat(indent);

    let result = `${prefix}${tagHex} (${tagName})`;

    if (data.children && data.children.length > 0) {
        result += ':\n';
        for (const child of data.children) {
            result += formatTlvData(child, indent + 1);
        }
    } else {
        const buffer = Buffer.from(data.value);
        const formatter = getTagFormatter(tagNum);

        if (formatter) {
            // Use custom formatter for known tags
            const formatted = formatter(buffer);
            result += `: ${formatted}\n`;
        } else if (BINARY_TAGS.has(tagNum)) {
            // For binary data (certificates, etc.), only show hex with truncation
            const hex = buffer.toString('hex').toUpperCase();
            if (hex.length > 64) {
                result += `: ${hex.substring(0, 64)}... (${buffer.length} bytes)\n`;
            } else {
                result += `: ${hex}\n`;
            }
        } else {
            // Default: show hex and ASCII
            const hex = buffer.toString('hex').toUpperCase();
            const ascii = buffer.toString().replace(/[^\x20-\x7E]/g, '.');
            result += `: ${hex} [${ascii}]\n`;
        }
    }

    return result;
}

function findInTlv(data: Tlv, tag: number): Buffer | undefined {
    const tagNum = data.tag.bytes ? tagBytesToNumber(data.tag.bytes) : data.tag.number;
    if (tagNum === tag) {
        return Buffer.from(data.value);
    }

    if (data.children) {
        for (const child of data.children) {
            const result = findInTlv(child, tag);
            if (result !== undefined) {
                return result;
            }
        }
    }

    return undefined;
}

/**
 * Format a card response as a human-readable string
 */
export function format(response: CardResponse): string {
    const parsed = parse(response.buffer);
    if (parsed.length === 0) {
        return '';
    }
    return parsed.map((tlv) => formatTlvData(tlv)).join('');
}

/**
 * Find a specific tag in a Buffer containing TLV data
 * @param buffer - The buffer to search
 * @param tag - The tag number to find (e.g., 0x4F for APP_IDENTIFIER)
 * @returns The tag value as a Buffer, or undefined if not found
 */
export function findTagInBuffer(buffer: Buffer, tag: number): Buffer | undefined {
    const parsed = parse(buffer);
    for (const tlv of parsed) {
        const result = findInTlv(tlv, tag);
        if (result !== undefined) {
            return result;
        }
    }
    return undefined;
}

/**
 * Find a specific tag in a card response
 * @param response - The card response to search
 * @param tag - The tag number to find (e.g., 0x4F for APP_IDENTIFIER)
 * @returns The tag value as a Buffer, or undefined if not found
 */
export function findTag(response: CardResponse, tag: number): Buffer | undefined {
    return findTagInBuffer(response.buffer, tag);
}
