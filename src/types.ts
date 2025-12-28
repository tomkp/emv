/**
 * Response from an EMV card command
 */
export interface CardResponse {
    /** Raw response buffer */
    buffer: Buffer;
    /** Check if the response indicates success (SW1=0x90, SW2=0x00) */
    isOk(): boolean;
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
 * Card reader device interface
 */
export interface CardReader {
    name: string;
}

/**
 * ISO7816 interface for smartcard communication
 */
export interface Iso7816 {
    selectFile(data: Buffer | number[]): Promise<CardResponse>;
    readRecord(sfi: number, record: number): Promise<CardResponse>;
}

/**
 * Factory function type for creating ISO7816 instances
 */
export type Iso7816Factory = (devices: unknown, cardReader: CardReader) => Iso7816;
