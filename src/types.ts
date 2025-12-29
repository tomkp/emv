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
 * Transmit options for smartcard package
 */
export interface TransmitOptions {
    /** Automatically handle T=0 status words (SW1=61, SW1=6C) */
    autoGetResponse?: boolean;
}

/**
 * Card interface from smartcard package
 */
export interface SmartCard {
    /** Answer to Reset */
    atr: Buffer;
    /** Transmit APDU command to card */
    transmit(apdu: Buffer | number[], options?: TransmitOptions): Promise<Buffer>;
}

/**
 * Reader interface from smartcard package
 */
export interface Reader {
    /** Reader name */
    name: string;
}
