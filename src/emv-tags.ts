import { parse, type Tlv } from '@tomkp/ber-tlv';
import type { CardResponse } from './types.js';

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
        const hex = Buffer.from(data.value).toString('hex').toUpperCase();
        const ascii = Buffer.from(data.value)
            .toString()
            .replace(/[^\x20-\x7E]/g, '.');
        result += `: ${hex} [${ascii}]\n`;
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
 * Find a specific tag in a card response
 * @param response - The card response to search
 * @param tag - The tag number to find (e.g., 0x4F for APP_IDENTIFIER)
 * @returns The tag value as a Buffer, or undefined if not found
 */
export function findTag(response: CardResponse, tag: number): Buffer | undefined {
    const parsed = parse(response.buffer);
    for (const tlv of parsed) {
        const result = findInTlv(tlv, tag);
        if (result !== undefined) {
            return result;
        }
    }
    return undefined;
}
