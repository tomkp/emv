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
 * Card interface from smartcard package
 */
export interface SmartCard {
    /** Answer to Reset */
    atr: Buffer;
    /** Transmit APDU command to card */
    transmit(apdu: Buffer | number[]): Promise<Buffer>;
}

/**
 * Reader interface from smartcard package
 */
export interface Reader {
    /** Reader name */
    name: string;
}
