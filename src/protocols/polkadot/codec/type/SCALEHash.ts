import { SCALEType } from "../type/SCALEType"
import { isString } from "util"
import { isHex, stripHexPrefix } from "../../../../utils/hex"
import { SCALEDecodeResult } from "../SCALEDecoder"

export class SCALEHash extends SCALEType {
    public static empty(bitLength: number = 0): SCALEHash {
        const byteLength = Math.ceil(bitLength / 8)
        const u8a = new Uint8Array(byteLength)
        u8a.fill(0)

        return new SCALEHash(Buffer.from(u8a))
    }
    
    public static from(bytes: string | Buffer | Uint8Array): SCALEHash {
        let buffer: Buffer
        if (isString(bytes) && isHex(bytes)) {
            buffer = Buffer.from(stripHexPrefix(bytes), 'hex')
        } else if (!isString(bytes)) {
            buffer = Buffer.from(bytes)
        } else {
            throw new Error('Unknown bytes type.')
        }

        return new SCALEHash(buffer)
    }

    public static decode(hex: string, bitLength: number): SCALEDecodeResult<SCALEHash> {
        const nibbles = Math.ceil(bitLength / 4)
        const hash = hex.substr(0, nibbles)

        return {
            bytesDecoded: Math.ceil(nibbles / 2),
            decoded: SCALEHash.from(hash)
        }
    }

    public get isEmpty(): boolean {
        return this.value.length === 0
    }

    private constructor(readonly value: Buffer) { super() }

    protected _encode(): string {
        return this.value.toString('hex')
    }
}