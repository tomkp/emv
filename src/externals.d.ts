declare module 'tlv' {
    interface TlvData {
        tag: number;
        value: Buffer | TlvData[];
    }

    function parse(buffer: Buffer): TlvData;

    export = { parse };
}

declare module 'iso7816' {
    interface CardResponse {
        buffer: Buffer;
        isOk(): boolean;
    }

    interface Iso7816 {
        selectFile(data: Buffer | number[]): Promise<CardResponse>;
        readRecord(sfi: number, record: number): Promise<CardResponse>;
    }

    function iso7816(devices: unknown, cardReader: unknown): Iso7816;

    export = iso7816;
}
