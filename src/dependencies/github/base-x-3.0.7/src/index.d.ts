/// <reference types="node" />
declare function base(ALPHABET: string): base.BaseConverter;
export = base;
declare namespace base {
    interface BaseConverter {
        encode(buffer: Buffer): string;
        decodeUnsafe(string: string): Buffer | undefined;
        decode(string: string): Buffer;
    }
}
