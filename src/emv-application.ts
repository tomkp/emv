import { randomBytes } from 'node:crypto';
import type { CardResponse, SmartCard, Reader } from './types.js';
import { findAllTagsInBuffer, findTagInBuffer } from './emv-tags.js';

/**
 * AFL (Application File Locator) entry
 */
export interface AflEntry {
    sfi: number;
    firstRecord: number;
    lastRecord: number;
    sdaRecords: number;
}

/**
 * PDOL/CDOL entry (tag + length)
 */
export interface DolEntry {
    tag: number;
    length: number;
}

/**
 * Transaction options
 */
export interface TransactionOptions {
    /** Amount in minor units (e.g., cents) */
    amount: number;
    /** ISO 4217 currency code (e.g., 0x0840 for USD) */
    currencyCode: number;
    /** ISO 3166-1 terminal country code (default: currencyCode, see PdolBuildOptions.countryCode) */
    countryCode?: number;
    /** Transaction type (0x00 = purchase, 0x01 = cash, 0x09 = cashback) */
    transactionType?: number;
    /** Cryptogram type to request: 'ARQC' (online), 'TC' (offline approve), 'AAC' (decline) */
    cryptogramType?: 'ARQC' | 'TC' | 'AAC';
    /**
     * Tag values for the PDOL, overriding the defaults.
     * An unpredictable number (9F37) given here and not in cdolValues is used for both.
     */
    pdolValues?: Map<number, Buffer>;
    /**
     * Tag values for the CDOL1, overriding the defaults.
     * An unpredictable number (9F37) given here and not in pdolValues is used for both.
     */
    cdolValues?: Map<number, Buffer>;
}

/**
 * Transaction result
 */
export interface TransactionResult {
    success: boolean;
    error?: string | undefined;
    /** AIP from GPO response */
    aip?: Buffer | undefined;
    /** AFL entries from GPO response */
    afl?: AflEntry[] | undefined;
    /** Records read from card */
    records?: Buffer[] | undefined;
    /** Cryptogram type returned by card */
    cryptogramType?: 'ARQC' | 'TC' | 'AAC' | undefined;
    /** Application cryptogram */
    cryptogram?: Buffer | undefined;
    /** Application Transaction Counter */
    atc?: number | undefined;
    /** Full Generate AC response */
    generateAcResponse?: Buffer | undefined;
}

/**
 * Record read from card with metadata
 */
export interface RecordData {
    /** Short File Identifier */
    sfi: number;
    /** Record number */
    recordNumber: number;
    /** Raw record data */
    data: Buffer;
}

/**
 * Options for building default PDOL data
 */
export interface PdolBuildOptions {
    /** Amount in minor units (e.g., cents) */
    amount: number;
    /** ISO 4217 currency code (e.g., 0x0840 for USD) */
    currencyCode: number;
    /**
     * ISO 3166-1 terminal country code (e.g., 0x0826 for the UK).
     * Defaults to currencyCode, which matches for national currencies such as USD or GBP.
     * Set it for currencies shared by several countries, such as EUR (0x0978).
     */
    countryCode?: number;
    /** Transaction type (default 0x00 = purchase) */
    transactionType?: number;
    /** Custom tag value overrides */
    overrides?: Map<number, Buffer>;
}

/**
 * Options for building default CDOL data
 */
export interface CdolBuildOptions {
    /** Amount in minor units (e.g., cents) */
    amount: number;
    /** ISO 4217 currency code (e.g., 0x0840 for USD) */
    currencyCode: number;
    /** ISO 3166-1 terminal country code (default: currencyCode, see PdolBuildOptions.countryCode) */
    countryCode?: number;
    /** Transaction type (default 0x00 = purchase) */
    transactionType?: number;
    /** Terminal Verification Results (default all zeros) */
    tvr?: Buffer;
    /** Custom tag value overrides */
    overrides?: Map<number, Buffer>;
}

/**
 * CVM (Cardholder Verification Method) method types
 */
export type CvmMethod =
    | 'fail'
    | 'plaintext_pin_icc'
    | 'enciphered_pin_online'
    | 'plaintext_pin_icc_signature'
    | 'enciphered_pin_icc'
    | 'enciphered_pin_icc_signature'
    | 'signature'
    | 'no_cvm'
    | 'unknown';

/**
 * CVM condition types
 */
export type CvmCondition =
    | 'always'
    | 'unattended_cash'
    | 'not_unattended_cash_manual_pin'
    | 'terminal_supports_cvm'
    | 'manual_cash'
    | 'purchase_with_cashback'
    | 'amount_under_x'
    | 'amount_over_x'
    | 'amount_under_y'
    | 'amount_over_y'
    | 'unknown';

/**
 * A single CVM rule
 */
export interface CvmRule {
    /** The verification method */
    method: CvmMethod;
    /** The condition for this rule to apply */
    condition: CvmCondition;
    /** If true, transaction fails if this CVM fails. If false, try next rule. */
    failIfUnsuccessful: boolean;
    /** Raw CVM byte */
    cvmByte: number;
    /** Raw condition byte */
    conditionByte: number;
}

/**
 * Parsed CVM list
 */
export interface CvmList {
    /** Amount X threshold (in currency minor units) */
    amountX: number;
    /** Amount Y threshold (in currency minor units) */
    amountY: number;
    /** CVM rules in priority order */
    rules: CvmRule[];
}

/**
 * Context for CVM evaluation
 */
export interface CvmContext {
    /** Transaction amount in minor units */
    amount?: number;
    /** Whether terminal supports CVM */
    terminalSupportsCvm?: boolean;
    /** Whether this is unattended cash */
    unattendedCash?: boolean;
    /** Whether this is manual cash */
    manualCash?: boolean;
    /** Whether this is purchase with cashback */
    purchaseWithCashback?: boolean;
}

/**
 * Information about a discovered application from PSE/PPSE
 */
export interface DiscoveredApp {
    /** Application Identifier (AID) as hex string */
    aid: string;
    /** Application label (human-readable name) */
    label?: string | undefined;
    /** Application priority indicator */
    priority?: number | undefined;
}

/**
 * Result from discovering applications via PSE/PPSE
 */
export interface DiscoverAppsResult {
    /** Whether the PSE/PPSE selection succeeded */
    success: boolean;
    /** List of discovered applications */
    apps: DiscoveredApp[];
    /** SFI used for reading records (0 for PPSE, which has no records) */
    sfi: number;
    /** Raw PSE/PPSE response buffer */
    pseBuffer?: Buffer | undefined;
    /** Which directory the applications came from */
    source?: 'pse' | 'ppse' | undefined;
    /** Directory records read from the PSE */
    records?: RecordData[] | undefined;
}

/**
 * The card operations needed to read the payment system directory
 */
export interface DirectoryReader {
    selectPse(): Promise<CardResponse>;
    selectPpse?(): Promise<CardResponse>;
    readRecord(sfi: number, record: number): Promise<CardResponse>;
}

/**
 * Result from parsing a GPO (GET PROCESSING OPTIONS) response
 */
export interface GpoResult {
    /** Application Interchange Profile */
    aip: Buffer | undefined;
    /** Application File Locator entries */
    afl: AflEntry[];
}

/**
 * Result from parsing a Generate AC response
 */
export interface GenerateAcResult {
    /** Type of cryptogram returned */
    cryptogramType: 'ARQC' | 'TC' | 'AAC' | undefined;
    /** Application cryptogram value */
    cryptogram: Buffer | undefined;
    /** Application Transaction Counter */
    atc: number | undefined;
}

/**
 * Payment System Environment (PSE) identifier for contact cards
 * "1PAY.SYS.DDF01" encoded as bytes
 */
const PSE = Buffer.from([
    0x31, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e, 0x44, 0x44, 0x46, 0x30, 0x31,
]);

/**
 * Proximity Payment System Environment (PPSE) identifier for contactless cards
 * "2PAY.SYS.DDF01" encoded as bytes
 */
const PPSE = Buffer.from([
    0x32, 0x50, 0x41, 0x59, 0x2e, 0x53, 0x59, 0x53, 0x2e, 0x44, 0x44, 0x46, 0x30, 0x31,
]);

/**
 * Parse APDU response into CardResponse
 */
function parseResponse(response: Buffer): CardResponse {
    const sw1 = response[response.length - 2] ?? 0;
    const sw2 = response[response.length - 1] ?? 0;
    const data = response.subarray(0, response.length - 2);

    return {
        buffer: data,
        sw1,
        sw2,
        isOk: () => sw1 === 0x90 && sw2 === 0x00,
    };
}

/**
 * Build SELECT FILE APDU command
 */
function buildSelectApdu(data: Buffer): Buffer {
    return Buffer.from([
        0x00, // CLA
        0xa4, // INS: SELECT
        0x04, // P1: Select by DF name
        0x00, // P2: First or only occurrence
        data.length, // Lc
        ...data,
        0x00, // Le: Maximum response length
    ]);
}

/**
 * Build READ RECORD APDU command
 */
function buildReadRecordApdu(sfi: number, record: number): Buffer {
    const p2 = (sfi << 3) | 0x04; // SFI in upper 5 bits, 0x04 = read record
    return Buffer.from([
        0x00, // CLA
        0xb2, // INS: READ RECORD
        record, // P1: Record number
        p2, // P2: SFI and read mode
        0x00, // Le: Maximum response length
    ]);
}

/**
 * Build GET DATA APDU command
 */
function buildGetDataApdu(tag: number): Buffer {
    const p1 = (tag >> 8) & 0xff; // High byte of tag
    const p2 = tag & 0xff; // Low byte of tag
    return Buffer.from([
        0x80, // CLA: proprietary
        0xca, // INS: GET DATA
        p1, // P1: high byte of tag
        p2, // P2: low byte of tag
        0x00, // Le: maximum response length
    ]);
}

/**
 * Build GET PROCESSING OPTIONS APDU command
 */
function buildGpoApdu(pdolData: Buffer): Buffer {
    // Command data is wrapped in tag 83 (Command Template), with a BER length:
    // one byte up to 127, then 81 followed by the length
    if (pdolData.length > 252) {
        throw new RangeError(
            `PDOL data must be at most 252 bytes to fit a GET PROCESSING OPTIONS command, got ${String(pdolData.length)}`
        );
    }
    const length = pdolData.length < 0x80 ? [pdolData.length] : [0x81, pdolData.length];
    const commandData = Buffer.from([0x83, ...length, ...pdolData]);
    return Buffer.from([
        0x80, // CLA: proprietary
        0xa8, // INS: GET PROCESSING OPTIONS
        0x00, // P1
        0x00, // P2
        commandData.length, // Lc
        ...commandData,
        0x00, // Le: maximum response length
    ]);
}

/**
 * Build GENERATE APPLICATION CRYPTOGRAM APDU command
 */
function buildGenerateAcApdu(cryptogramType: number, cdolData: Buffer): Buffer {
    return Buffer.from([
        0x80, // CLA: proprietary
        0xae, // INS: GENERATE AC
        cryptogramType, // P1: cryptogram type
        0x00, // P2
        cdolData.length, // Lc
        ...cdolData,
        0x00, // Le: maximum response length
    ]);
}

/**
 * Build INTERNAL AUTHENTICATE APDU command
 */
function buildInternalAuthenticateApdu(authData: Buffer): Buffer {
    return Buffer.from([
        0x00, // CLA
        0x88, // INS: INTERNAL AUTHENTICATE
        0x00, // P1
        0x00, // P2
        authData.length, // Lc
        ...authData,
        0x00, // Le: maximum response length
    ]);
}

/**
 * Parse AFL (Application File Locator) from buffer.
 * Each AFL entry is 4 bytes: SFI (5 bits) | 000, first record, last record, SDA records
 */
export function parseAfl(buffer: Buffer): AflEntry[] {
    const entries: AflEntry[] = [];
    for (let i = 0; i + 3 < buffer.length; i += 4) {
        const sfiByte = buffer[i];
        const firstRecord = buffer[i + 1];
        const lastRecord = buffer[i + 2];
        const sdaRecords = buffer[i + 3];
        if (
            sfiByte === undefined ||
            firstRecord === undefined ||
            lastRecord === undefined ||
            sdaRecords === undefined
        ) {
            continue;
        }
        entries.push({
            sfi: sfiByte >> 3,
            firstRecord,
            lastRecord,
            sdaRecords,
        });
    }
    return entries;
}

/**
 * Parse a GPO (GET PROCESSING OPTIONS) response buffer.
 * Supports both Format 1 (tag 80) and Format 2 (tag 77) responses.
 *
 * @param buffer - Raw GPO response data (without status words)
 * @returns Parsed AIP and AFL entries
 */
export function parseGpoResponseBuffer(buffer: Buffer): GpoResult {
    if (buffer.length === 0) {
        return { aip: undefined, afl: [] };
    }

    const firstByte = buffer[0];
    if (firstByte === 0x80) {
        // Format 1: 80 len AIP(2) AFL(var)
        const len = buffer[1];
        if (len === undefined || len < 2) {
            return { aip: undefined, afl: [] };
        }
        // Validate buffer has enough data for header + len bytes (at least 4 for AIP)
        if (buffer.length < 4 || buffer.length < 2 + len) {
            return { aip: undefined, afl: [] };
        }
        const aip = buffer.subarray(2, 4);
        const aflBuffer = buffer.subarray(4, 2 + len);
        return { aip, afl: parseAfl(aflBuffer) };
    } else if (firstByte === 0x77) {
        // Format 2: TLV structure with tags 82 (AIP) and 94 (AFL)
        const aip = findTagInBuffer(buffer, 0x82);
        const aflBuffer = findTagInBuffer(buffer, 0x94);
        return { aip, afl: aflBuffer ? parseAfl(aflBuffer) : [] };
    }

    // Unknown format
    return { aip: undefined, afl: [] };
}

/**
 * Parse a Generate AC response buffer.
 * Extracts cryptogram type, cryptogram value, and ATC.
 *
 * @param buffer - Raw Generate AC response data (without status words)
 * @returns Parsed cryptogram details
 */
export function parseGenerateAcResponse(buffer: Buffer): GenerateAcResult {
    const cid = findTagInBuffer(buffer, 0x9f27);
    const cryptogram = findTagInBuffer(buffer, 0x9f26);
    const atcBuffer = findTagInBuffer(buffer, 0x9f36);

    const cryptogramType = cid && cid[0] !== undefined ? byteToCryptogramType(cid[0]) : undefined;
    const atc = atcBuffer && atcBuffer.length >= 2 ? atcBuffer.readUInt16BE(0) : undefined;

    return { cryptogramType, cryptogram, atc };
}

/**
 * Parse PDOL or CDOL (Data Object List) from buffer.
 * Format: tag (1-2 bytes) + length (1 byte), repeated
 */
export function parsePdol(buffer: Buffer): DolEntry[] {
    const entries: DolEntry[] = [];
    let i = 0;
    while (i < buffer.length) {
        const firstByte = buffer[i];
        if (firstByte === undefined) break;

        let tag: number;
        // Check if it's a two-byte tag (first byte has bits 1-5 all set)
        if ((firstByte & 0x1f) === 0x1f) {
            const secondByte = buffer[i + 1];
            if (secondByte === undefined) break;
            tag = (firstByte << 8) | secondByte;
            i += 2;
        } else {
            tag = firstByte;
            i += 1;
        }

        const length = buffer[i];
        if (length === undefined) break;
        i += 1;

        entries.push({ tag, length });
    }
    return entries;
}

/**
 * Build PDOL/CDOL data from tag entries and values.
 * Missing values are padded with zeros.
 */
export function buildPdolData(entries: DolEntry[], tagValues: Map<number, Buffer>): Buffer {
    const chunks: Buffer[] = [];
    for (const entry of entries) {
        const value = tagValues.get(entry.tag);
        if (value) {
            if (value.length >= entry.length) {
                chunks.push(value.subarray(0, entry.length));
            } else {
                // Pad with leading zeros if value is shorter
                const padded = Buffer.alloc(entry.length);
                value.copy(padded, entry.length - value.length);
                chunks.push(padded);
            }
        } else {
            // No value provided, use zeros
            chunks.push(Buffer.alloc(entry.length));
        }
    }
    return Buffer.concat(chunks);
}

/**
 * Common terminal data needed to build PDOL and CDOL data
 */
interface TerminalDataOptions {
    amount: number;
    currencyCode: number;
    countryCode?: number | undefined;
    transactionType?: number | undefined;
    tvr?: Buffer | undefined;
}

/**
 * Default terminal values for the tags cards commonly request in their PDOL and CDOL1.
 * Tags a card requests that are not listed here are sent as zeros by buildPdolData.
 */
function defaultTerminalData(options: TerminalDataOptions): Map<number, Buffer> {
    const {
        amount,
        currencyCode,
        countryCode = currencyCode,
        transactionType = 0x00,
        tvr = Buffer.alloc(5),
    } = options;

    return new Map<number, Buffer>([
        [0x9f02, amountToBcd(amount)], // Amount, Authorized
        [0x9f03, Buffer.alloc(6)], // Amount, Other
        [0x9f1a, uint16(countryCode)], // Terminal Country Code
        [0x95, tvr], // Terminal Verification Results
        [0x5f2a, uint16(currencyCode)], // Transaction Currency Code
        [0x9a, getCurrentDateBcd()], // Transaction Date
        [0x9c, Buffer.from([transactionType])], // Transaction Type
        [0x9f37, randomBytes(4)], // Unpredictable Number
        [0x9f35, Buffer.from([0x22])], // Terminal Type
        [0x9f45, Buffer.alloc(2)], // Data Authentication Code
        [0x9f34, Buffer.from([0x00, 0x00, 0x00])], // CVM Results
        [0x9f66, Buffer.from([0x86, 0x00, 0x00, 0x00])], // TTQ (Terminal Transaction Qualifiers)
    ]);
}

/**
 * Copy a map of tag values with overrides applied
 */
function withOverrides(
    values: Map<number, Buffer>,
    overrides: Map<number, Buffer> | undefined
): Map<number, Buffer> {
    const merged = new Map(values);
    overrides?.forEach((value, tag) => {
        merged.set(tag, value);
    });
    return merged;
}

/**
 * Encode a number as 2 bytes, big-endian (e.g., country and currency codes)
 */
function uint16(value: number): Buffer {
    return Buffer.from([(value >> 8) & 0xff, value & 0xff]);
}

/**
 * CDOL1 layout used when the card's own CDOL1 (tag 8C) is not known:
 * amount, other amount, country code, TVR, currency, date, type, unpredictable number (29 bytes).
 */
const COMMON_CDOL1: readonly DolEntry[] = [
    { tag: 0x9f02, length: 6 },
    { tag: 0x9f03, length: 6 },
    { tag: 0x9f1a, length: 2 },
    { tag: 0x95, length: 5 },
    { tag: 0x5f2a, length: 2 },
    { tag: 0x9a, length: 3 },
    { tag: 0x9c, length: 1 },
    { tag: 0x9f37, length: 4 },
];

/**
 * Build PDOL data with sensible default values for common EMV tags.
 * Use this when you need to construct PDOL data for GPO but don't have
 * all the specific terminal values.
 *
 * @param entries - PDOL entries from parsePdol()
 * @param options - Transaction options (amount, currency, etc.)
 * @returns Buffer containing PDOL data ready for GPO
 */
export function buildDefaultPdolData(entries: DolEntry[], options: PdolBuildOptions): Buffer {
    return buildPdolData(entries, withOverrides(defaultTerminalData(options), options.overrides));
}

/**
 * Build CDOL data for the Generate AC command with sensible default values.
 *
 * Pass the card's CDOL1 (tag 8C, parsed with parsePdol()) as `entries` so the data
 * matches what the card asks for. Without it, a common 29-byte CDOL1 layout is used,
 * which many cards will reject.
 *
 * @param entries - CDOL entries from parsePdol() (optional)
 * @param options - Transaction options (amount, currency, etc.)
 * @returns Buffer containing CDOL data ready for Generate AC
 */
export function buildDefaultCdolData(options: CdolBuildOptions): Buffer;
export function buildDefaultCdolData(entries: DolEntry[], options: CdolBuildOptions): Buffer;
export function buildDefaultCdolData(
    entriesOrOptions: DolEntry[] | CdolBuildOptions,
    maybeOptions?: CdolBuildOptions
): Buffer {
    const [entries, options] = Array.isArray(entriesOrOptions)
        ? [entriesOrOptions, maybeOptions]
        : [COMMON_CDOL1, entriesOrOptions];
    if (!options) {
        throw new TypeError('buildDefaultCdolData requires transaction options');
    }
    return buildPdolData(
        [...entries],
        withOverrides(defaultTerminalData(options), options.overrides)
    );
}

/**
 * Parse CVM (Cardholder Verification Method) List from EMV tag 8E.
 * The CVM List contains amount thresholds and a list of verification rules.
 *
 * @param buffer - The CVM List data (tag 8E)
 * @returns Parsed CVM list with amount thresholds and rules
 */
export function parseCvmList(buffer: Buffer): CvmList {
    // CVM List structure:
    // Bytes 0-3: Amount X (4 bytes, big-endian)
    // Bytes 4-7: Amount Y (4 bytes, big-endian)
    // Bytes 8+: CVM rules (2 bytes each)

    if (buffer.length < 8) {
        return { amountX: 0, amountY: 0, rules: [] };
    }

    const amountX = buffer.readUInt32BE(0);
    const amountY = buffer.readUInt32BE(4);
    const rules: CvmRule[] = [];

    // Parse CVM rules (2 bytes each)
    for (let i = 8; i + 1 < buffer.length; i += 2) {
        const cvmByte = buffer[i] as number;
        const conditionByte = buffer[i + 1] as number;

        // Bit 6 of CVM byte indicates fail behavior (0 = fail, 1 = continue)
        const failIfUnsuccessful = (cvmByte & 0x40) === 0;

        // Bits 0-5 of CVM byte indicate the method
        const methodCode = cvmByte & 0x3f;
        const method = cvmCodeToMethod(methodCode);

        const condition = conditionByteToCondition(conditionByte);

        rules.push({
            method,
            condition,
            failIfUnsuccessful,
            cvmByte,
            conditionByte,
        });
    }

    return { amountX, amountY, rules };
}

/**
 * Convert CVM method code to CvmMethod type
 */
function cvmCodeToMethod(code: number): CvmMethod {
    switch (code) {
        case 0x00:
            return 'fail';
        case 0x01:
            return 'plaintext_pin_icc';
        case 0x02:
            return 'enciphered_pin_online';
        case 0x03:
            return 'plaintext_pin_icc_signature';
        case 0x04:
            return 'enciphered_pin_icc';
        case 0x05:
            return 'enciphered_pin_icc_signature';
        case 0x1e:
            return 'signature';
        case 0x1f:
            return 'no_cvm';
        default:
            return 'unknown';
    }
}

/**
 * Convert condition byte to CvmCondition type
 */
function conditionByteToCondition(code: number): CvmCondition {
    switch (code) {
        case 0x00:
            return 'always';
        case 0x01:
            return 'unattended_cash';
        case 0x02:
            return 'not_unattended_cash_manual_pin';
        case 0x03:
            return 'terminal_supports_cvm';
        case 0x04:
            return 'manual_cash';
        case 0x05:
            return 'purchase_with_cashback';
        case 0x06:
            return 'amount_under_x';
        case 0x07:
            return 'amount_over_x';
        case 0x08:
            return 'amount_under_y';
        case 0x09:
            return 'amount_over_y';
        default:
            return 'unknown';
    }
}

/**
 * Evaluate CVM rules against a transaction context and return the first matching rule.
 * This simulates the terminal's CVM selection process.
 *
 * @param cvmList - Parsed CVM list
 * @param context - Transaction context with relevant conditions
 * @returns The first matching CVM rule, or undefined if none match
 */
export function evaluateCvm(cvmList: CvmList, context: CvmContext): CvmRule | undefined {
    for (const rule of cvmList.rules) {
        if (evaluateCondition(rule.condition, cvmList, context)) {
            return rule;
        }
    }
    return undefined;
}

/**
 * Evaluate a CVM condition against the transaction context
 */
function evaluateCondition(
    condition: CvmCondition,
    cvmList: CvmList,
    context: CvmContext
): boolean {
    switch (condition) {
        case 'always':
            return true;

        case 'unattended_cash':
            return context.unattendedCash === true;

        case 'not_unattended_cash_manual_pin':
            return (
                context.unattendedCash !== true &&
                context.manualCash !== true &&
                context.purchaseWithCashback !== true
            );

        case 'terminal_supports_cvm':
            return context.terminalSupportsCvm === true;

        case 'manual_cash':
            return context.manualCash === true;

        case 'purchase_with_cashback':
            return context.purchaseWithCashback === true;

        case 'amount_under_x':
            return context.amount !== undefined && context.amount < cvmList.amountX;

        case 'amount_over_x':
            return context.amount !== undefined && context.amount > cvmList.amountX;

        case 'amount_under_y':
            return context.amount !== undefined && context.amount < cvmList.amountY;

        case 'amount_over_y':
            return context.amount !== undefined && context.amount > cvmList.amountY;

        case 'unknown':
        default:
            return false;
    }
}

/**
 * Convert cryptogram type string to byte value
 */
function cryptogramTypeToByte(type: 'ARQC' | 'TC' | 'AAC'): number {
    switch (type) {
        case 'AAC':
            return 0x00;
        case 'TC':
            return 0x40;
        case 'ARQC':
            return 0x80;
    }
}

/**
 * Convert CID byte to cryptogram type string
 */
function byteToCryptogramType(cid: number): 'ARQC' | 'TC' | 'AAC' | undefined {
    const type = cid & 0xc0;
    switch (type) {
        case 0x00:
            return 'AAC';
        case 0x40:
            return 'TC';
        case 0x80:
            return 'ARQC';
        default:
            return undefined;
    }
}

/**
 * Convert amount to 6-byte BCD format (12 digits)
 * @throws RangeError if amount is not a whole number of minor units that fits in 12 digits
 */
function amountToBcd(amount: number): Buffer {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 999_999_999_999) {
        throw new RangeError(
            `Amount must be a whole number of minor units (e.g., cents) from 0 to 999999999999, got ${String(amount)}`
        );
    }
    // The decimal digits, read as hex, are the BCD encoding
    return Buffer.from(amount.toString().padStart(12, '0'), 'hex');
}

/**
 * Find a tag in data that may not be TLV: records in SFIs 11-30 can be in a
 * proprietary format, which the TLV parser rejects.
 */
function findTagIfTlv(buffer: Buffer, tag: number): Buffer | undefined {
    try {
        return findTagInBuffer(buffer, tag);
    } catch {
        return undefined;
    }
}

/**
 * Applications listed in a payment system directory record (PSE) or FCI (PPSE).
 * Each Application Template (tag 61) describes one application.
 */
function appsFromDirectory(buffer: Buffer): DiscoveredApp[] {
    const templates = findAllTagsInBuffer(buffer, 0x61);
    const entries = templates.length > 0 ? templates : [buffer];
    const apps: DiscoveredApp[] = [];
    for (const entry of entries) {
        const aid = findTagInBuffer(entry, 0x4f);
        if (aid) {
            apps.push({
                aid: aid.toString('hex'),
                label: findTagInBuffer(entry, 0x50)?.toString('ascii'),
                priority: findTagInBuffer(entry, 0x87)?.[0],
            });
        }
    }
    return apps;
}

/**
 * Discover payment applications from the PSE (contact), falling back to the
 * PPSE (contactless) when the PSE is missing or lists no applications.
 *
 * @param card - Card operations used to read the directory
 */
export async function discoverApplicationsFrom(card: DirectoryReader): Promise<DiscoverAppsResult> {
    const pseResponse = await card.selectPse();
    let pse: DiscoverAppsResult = { success: false, apps: [], sfi: 1, source: 'pse', records: [] };

    if (pseResponse.isOk()) {
        const sfi = findTagInBuffer(pseResponse.buffer, 0x88)?.[0] ?? 1;
        const apps: DiscoveredApp[] = [];
        const records: RecordData[] = [];

        for (let record = 1; record <= 10; record++) {
            const response = await card.readRecord(sfi, record);
            if (!response.isOk()) break;
            records.push({ sfi, recordNumber: record, data: response.buffer });
            apps.push(...appsFromDirectory(response.buffer));
        }

        pse = { success: true, apps, sfi, pseBuffer: pseResponse.buffer, source: 'pse', records };
        if (apps.length > 0) {
            return pse;
        }
    }

    if (card.selectPpse) {
        const ppseResponse = await card.selectPpse();
        const apps = ppseResponse.isOk() ? appsFromDirectory(ppseResponse.buffer) : [];
        // Keep a PSE that was read (with its records) unless the PPSE lists applications
        if (ppseResponse.isOk() && (apps.length > 0 || !pse.success)) {
            return {
                success: true,
                apps,
                sfi: 0,
                pseBuffer: ppseResponse.buffer,
                source: 'ppse',
                records: [],
            };
        }
    }

    return pse;
}

/**
 * Convert a 2-character decimal string to a single BCD byte.
 *
 * Each character becomes one nibble: e.g. "25" -> 0x25 (high nibble 2, low nibble 5).
 *
 * @param str - A 2-character string containing decimal digits ("0"-"9")
 * @throws TypeError if input is not exactly 2 decimal digits
 */
export function stringToBcd(str: string): number {
    if (!/^[0-9]{2}$/.test(str)) {
        throw new TypeError(`stringToBcd expected a 2-digit decimal string, got "${str}"`);
    }
    const high = parseInt(str.charAt(0), 10);
    const low = parseInt(str.charAt(1), 10);
    return (high << 4) | low;
}

/**
 * Get current date as BCD YYMMDD
 */
function getCurrentDateBcd(): Buffer {
    const now = new Date();
    const year = (now.getFullYear() % 100).toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return Buffer.from([stringToBcd(year), stringToBcd(month), stringToBcd(day)]);
}

/**
 * Build PIN block in ISO 9564 Format 2 (BCD with 0xF padding)
 */
function buildPinBlock(pin: string): Buffer {
    const pinLength = pin.length;
    const pinBlock = Buffer.alloc(8);

    // First byte: 0x20 | PIN length
    pinBlock[0] = 0x20 | pinLength;

    // Encode PIN digits as BCD (two digits per byte), pad with 0xF
    for (let i = 0; i < 7; i++) {
        const char1 = pin[i * 2];
        const char2 = pin[i * 2 + 1];
        const digit1 = char1 !== undefined ? parseInt(char1, 10) : 0xf;
        const digit2 = char2 !== undefined ? parseInt(char2, 10) : 0xf;
        pinBlock[i + 1] = (digit1 << 4) | digit2;
    }

    return pinBlock;
}

/**
 * Build VERIFY PIN APDU command
 * PIN is encoded in ISO 9564 Format 2 (BCD with 0xF padding)
 */
function buildVerifyPinApdu(pin: string): Buffer {
    const pinBlock = buildPinBlock(pin);

    return Buffer.from([
        0x00, // CLA
        0x20, // INS: VERIFY
        0x00, // P1
        0x80, // P2: plaintext PIN
        0x08, // Lc: PIN block is always 8 bytes
        ...pinBlock,
    ]);
}

/**
 * Build CHANGE REFERENCE DATA APDU command for PIN change
 * Both old and new PINs are encoded in ISO 9564 Format 2
 */
function buildChangePinApdu(oldPin: string, newPin: string): Buffer {
    const oldPinBlock = buildPinBlock(oldPin);
    const newPinBlock = buildPinBlock(newPin);

    return Buffer.from([
        0x00, // CLA
        0x24, // INS: CHANGE REFERENCE DATA
        0x00, // P1
        0x80, // P2: plaintext PIN
        0x10, // Lc: 16 bytes (2 x 8-byte PIN blocks)
        ...oldPinBlock,
        ...newPinBlock,
    ]);
}

/**
 * EMV Application for interacting with chip cards via PC/SC readers.
 *
 * @example
 * ```typescript
 * import { Devices } from 'smartcard';
 * import { EmvApplication, format } from 'emv';
 *
 * const devices = new Devices();
 *
 * devices.on('card-inserted', async ({ reader, card }) => {
 *     const emv = new EmvApplication(reader, card);
 *     const response = await emv.selectPse();
 *     console.log(format(response));
 * });
 *
 * devices.start();
 * ```
 */
export class EmvApplication {
    readonly #card: SmartCard;
    readonly #reader: Reader;
    /** FCI returned when the current application was selected */
    #selectedFci: Buffer | undefined;

    constructor(reader: Reader, card: SmartCard) {
        this.#reader = reader;
        this.#card = card;
    }

    /**
     * Transmit an APDU with automatic T=0 protocol handling
     */
    async #transmit(apdu: Buffer): Promise<Buffer> {
        return this.#card.transmit(apdu, { autoGetResponse: true });
    }

    /**
     * Select the Payment System Environment (PSE) directory.
     * This is typically the first command sent to a contact payment card.
     */
    async selectPse(): Promise<CardResponse> {
        this.#selectedFci = undefined;
        const apdu = buildSelectApdu(PSE);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Select the Proximity Payment System Environment (PPSE) directory.
     * This is the first command sent to a contactless payment card.
     */
    async selectPpse(): Promise<CardResponse> {
        this.#selectedFci = undefined;
        const apdu = buildSelectApdu(PPSE);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Select an EMV application by its AID.
     * On success, the FCI is kept so later commands can use the application's PDOL.
     * @param aid - Application Identifier (5-16 bytes)
     */
    async selectApplication(aid: Buffer | readonly number[]): Promise<CardResponse> {
        const aidBuffer = Buffer.isBuffer(aid) ? aid : Buffer.from(aid);

        if (aidBuffer.length < 5 || aidBuffer.length > 16) {
            throw new RangeError('AID must be between 5 and 16 bytes');
        }

        this.#selectedFci = undefined;
        const apdu = buildSelectApdu(aidBuffer);
        const response = parseResponse(await this.#transmit(apdu));
        if (response.isOk()) {
            this.#selectedFci = response.buffer;
        }
        return response;
    }

    /**
     * Get the FCI (File Control Information) returned when the current
     * application was selected with selectApplication(), if any.
     */
    getSelectedFci(): Buffer | undefined {
        return this.#selectedFci;
    }

    /**
     * GET PROCESSING OPTIONS data: the selected application's PDOL (tag 9F38)
     * filled from `values`, or no data if the application has no PDOL.
     */
    #gpoData(values: Map<number, Buffer>): Buffer | undefined {
        const pdol = this.#selectedFci ? findTagInBuffer(this.#selectedFci, 0x9f38) : undefined;
        return pdol ? buildPdolData(parsePdol(pdol), values) : undefined;
    }

    /**
     * Initiate application processing: GET PROCESSING OPTIONS for the application
     * selected with selectApplication(), with its PDOL filled from default terminal
     * data (see buildDefaultPdolData).
     *
     * @param options - Transaction options (amount, currency, etc.)
     * @returns CardResponse containing AIP and AFL on success
     */
    async initiateApplicationProcessing(options: PdolBuildOptions): Promise<CardResponse> {
        const values = withOverrides(defaultTerminalData(options), options.overrides);
        return this.getProcessingOptions(this.#gpoData(values));
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

        const apdu = buildReadRecordApdu(sfi, record);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Read all records specified in the Application File Locator (AFL).
     * This automates the process of reading all card data after GPO.
     *
     * @param afl - AFL entries (from parseAfl) or raw AFL buffer
     * @returns Array of records with SFI and record number metadata
     */
    async readAllRecords(afl: AflEntry[] | Buffer): Promise<RecordData[]> {
        const entries = Buffer.isBuffer(afl) ? parseAfl(afl) : afl;
        const records: RecordData[] = [];

        for (const entry of entries) {
            for (let recordNum = entry.firstRecord; recordNum <= entry.lastRecord; recordNum++) {
                const response = await this.readRecord(entry.sfi, recordNum);
                if (response.isOk()) {
                    records.push({
                        sfi: entry.sfi,
                        recordNumber: recordNum,
                        data: response.buffer,
                    });
                }
                // Skip failed records silently - they may not exist on all cards
            }
        }

        return records;
    }

    /**
     * Discover payment applications on the card.
     * Reads the PSE (Payment System Environment) directory used by contact cards,
     * and falls back to the PPSE used by contactless cards when the PSE is missing
     * or lists no applications.
     *
     * @returns Result containing list of discovered applications
     */
    async discoverApplications(): Promise<DiscoverAppsResult> {
        return discoverApplicationsFrom(this);
    }

    /**
     * Verify the cardholder PIN (plaintext).
     * @param pin - PIN code as a string of 4-12 digits
     * @returns CardResponse with status words indicating success or failure:
     *   - SW 9000: PIN verified successfully
     *   - SW 63CX: Wrong PIN, X attempts remaining
     *   - SW 6983: PIN blocked (too many failed attempts)
     *   - SW 6984: PIN not initialized
     */
    async verifyPin(pin: string): Promise<CardResponse> {
        if (!/^\d{4,12}$/.test(pin)) {
            throw new RangeError('PIN must be a string of 4-12 digits');
        }

        const apdu = buildVerifyPinApdu(pin);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Change the cardholder PIN (plaintext).
     *
     * **Note:** Most payment cards restrict PIN change to specific environments
     * (ATM, bank terminal). This method is primarily useful for test cards.
     *
     * @param oldPin - Current PIN code as a string of 4-12 digits
     * @param newPin - New PIN code as a string of 4-12 digits
     * @returns CardResponse with status words indicating success or failure:
     *   - SW 9000: PIN changed successfully
     *   - SW 63CX: Wrong old PIN, X attempts remaining
     *   - SW 6983: PIN blocked (too many failed attempts)
     *   - SW 6984: PIN not initialized
     */
    async changePin(oldPin: string, newPin: string): Promise<CardResponse> {
        if (!/^\d{4,12}$/.test(oldPin)) {
            throw new RangeError('Old PIN must be a string of 4-12 digits');
        }
        if (!/^\d{4,12}$/.test(newPin)) {
            throw new RangeError('New PIN must be a string of 4-12 digits');
        }

        const apdu = buildChangePinApdu(oldPin, newPin);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Get data element from the card by tag.
     * @param tag - EMV tag (1-2 bytes, e.g., 0x9F17 for PIN Try Counter)
     * @returns CardResponse with the requested data or error status:
     *   - SW 9000: Success, data returned
     *   - SW 6A88: Referenced data not found
     */
    async getData(tag: number): Promise<CardResponse> {
        if (!Number.isInteger(tag) || tag < 0 || tag > 0xffff) {
            throw new RangeError('Tag must be a positive integer (0x0000-0xFFFF)');
        }

        const apdu = buildGetDataApdu(tag);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Initiate transaction processing (GET PROCESSING OPTIONS).
     * @param pdolData - Optional PDOL (Processing Data Object List) values
     * @returns CardResponse containing AIP and AFL on success:
     *   - SW 9000: Success, AIP and AFL returned
     *   - SW 6985: Conditions of use not satisfied
     */
    async getProcessingOptions(pdolData?: Buffer | readonly number[]): Promise<CardResponse> {
        const data = pdolData
            ? Buffer.isBuffer(pdolData)
                ? pdolData
                : Buffer.from(pdolData)
            : Buffer.alloc(0);

        const apdu = buildGpoApdu(data);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Generate an Application Cryptogram for transaction authorization.
     * @param cryptogramType - Type of cryptogram to generate:
     *   - 0x00: AAC (Application Authentication Cryptogram) - decline
     *   - 0x40: TC (Transaction Certificate) - approve offline
     *   - 0x80: ARQC (Authorization Request Cryptogram) - go online
     * @param cdolData - CDOL (Card Data Object List) data
     * @returns CardResponse containing the cryptogram on success
     */
    async generateAc(
        cryptogramType: number,
        cdolData: Buffer | readonly number[]
    ): Promise<CardResponse> {
        if (cryptogramType !== 0x00 && cryptogramType !== 0x40 && cryptogramType !== 0x80) {
            throw new RangeError('Cryptogram type must be AAC (0x00), TC (0x40), or ARQC (0x80)');
        }

        const data = Buffer.isBuffer(cdolData) ? cdolData : Buffer.from(cdolData);
        if (data.length === 0) {
            throw new RangeError('CDOL data must not be empty');
        }
        if (data.length > 255) {
            throw new RangeError(`CDOL data must be at most 255 bytes, got ${String(data.length)}`);
        }

        const apdu = buildGenerateAcApdu(cryptogramType, data);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Perform internal authentication for Dynamic Data Authentication (DDA).
     * @param authData - Authentication data (typically unpredictable number from terminal)
     * @returns CardResponse containing signed dynamic application data
     */
    async internalAuthenticate(authData: Buffer | readonly number[]): Promise<CardResponse> {
        const data = Buffer.isBuffer(authData) ? authData : Buffer.from(authData);
        if (data.length === 0) {
            throw new RangeError('Authentication data must not be empty');
        }

        const apdu = buildInternalAuthenticateApdu(data);
        const response = await this.#transmit(apdu);
        return parseResponse(response);
    }

    /**
     * Get the card's ATR (Answer To Reset)
     */
    getAtr(): string {
        return this.#card.atr.toString('hex');
    }

    /**
     * Get the reader name
     */
    getReaderName(): string {
        return this.#reader.name;
    }

    /**
     * Perform a complete EMV transaction flow.
     * This orchestrates: GPO → Read Records → Generate AC
     *
     * Select the application with selectApplication() first: GPO is sent with the
     * application's PDOL filled in, and Generate AC with the card's CDOL1 (tag 8C)
     * read from its records. Terminal values come from `options`, with `pdolValues`
     * and `cdolValues` overriding them.
     *
     * @param options - Transaction options including amount and currency
     * @returns TransactionResult with cryptogram and card data
     */
    async performTransaction(options: TransactionOptions): Promise<TransactionResult> {
        const { cryptogramType = 'ARQC', pdolValues, cdolValues } = options;

        // One set of terminal data for the whole transaction, so PDOL and CDOL agree
        // (e.g., on the unpredictable number)
        const terminalData = defaultTerminalData(options);
        // An unpredictable number given for only one of the two commands is used for both
        const unpredictableNumber = pdolValues?.get(0x9f37) ?? cdolValues?.get(0x9f37);
        if (unpredictableNumber) {
            terminalData.set(0x9f37, unpredictableNumber);
        }

        // Step 1: GET PROCESSING OPTIONS
        const gpoResponse = await this.getProcessingOptions(
            this.#gpoData(withOverrides(terminalData, pdolValues))
        );

        if (!gpoResponse.isOk()) {
            return {
                success: false,
                error: `GPO failed with SW ${gpoResponse.sw1.toString(16).padStart(2, '0')}${gpoResponse.sw2.toString(16).padStart(2, '0')}`,
            };
        }

        // Parse GPO response using the pure function
        const { aip, afl } = parseGpoResponseBuffer(gpoResponse.buffer);

        // Step 2: Read records from AFL
        const records = (await this.readAllRecords(afl)).map((record) => record.data);

        // Step 3: Build CDOL data from the card's CDOL1 and Generate AC
        const cdolTerminalData = new Map(terminalData);
        if (aip) {
            cdolTerminalData.set(0x82, aip);
        }
        let cdol1: Buffer | undefined;
        for (const record of records) {
            cdol1 = findTagIfTlv(record, 0x8c);
            if (cdol1) break;
        }
        const cdolData = buildPdolData(
            cdol1 ? parsePdol(cdol1) : [...COMMON_CDOL1],
            withOverrides(cdolTerminalData, cdolValues)
        );

        const cryptogramByte = cryptogramTypeToByte(cryptogramType);
        const acResponse = await this.generateAc(cryptogramByte, cdolData);

        if (!acResponse.isOk()) {
            return {
                success: false,
                error: `Generate AC failed with SW ${acResponse.sw1.toString(16).padStart(2, '0')}${acResponse.sw2.toString(16).padStart(2, '0')}`,
                aip,
                afl,
                records,
            };
        }

        // Parse Generate AC response using the pure function
        const acResult = parseGenerateAcResponse(acResponse.buffer);

        return {
            success: true,
            aip,
            afl,
            records,
            cryptogramType: acResult.cryptogramType,
            cryptogram: acResult.cryptogram,
            atc: acResult.atc,
            generateAcResponse: acResponse.buffer,
        };
    }
}

/**
 * Factory function to create an EmvApplication instance
 */
export function createEmvApplication(reader: Reader, card: SmartCard): EmvApplication {
    return new EmvApplication(reader, card);
}

export default createEmvApplication;
