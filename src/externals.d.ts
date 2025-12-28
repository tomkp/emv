declare module 'tlv' {
    interface TlvData {
        tag: number;
        value: Buffer | TlvData[];
    }

    function parse(buffer: Buffer): TlvData;

    export = { parse };
}
