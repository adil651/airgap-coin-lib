import { SubstrateNetwork } from '../../../../../../SubstrateNetwork'
import { SCALEDecoder, SCALEDecodeResult } from '../../../../scale/SCALEDecoder'
import { SCALEArray } from '../../../../scale/type/SCALEArray'
import { SCALEBytes } from '../../../../scale/type/SCALEBytes'
import { SCALEClass } from '../../../../scale/type/SCALEClass'
import { SCALEEnum } from '../../../../scale/type/SCALEEnum'
import { SCALEString } from '../../../../scale/type/SCALEString'

import { MetadataV11StorageEntryType } from './MetadataV11StorageEntryType'

enum StorageEntryModifier {
  Optional = 0,
  Default
}

export class MetadataV11StorageEntry extends SCALEClass {
  public static decode<Network extends SubstrateNetwork>(
    network: Network,
    runtimeVersion: number | undefined,
    raw: string
  ): SCALEDecodeResult<MetadataV11StorageEntry> {
    const decoder = new SCALEDecoder(network, runtimeVersion, raw)

    const name = decoder.decodeNextString()
    const modifier = decoder.decodeNextEnum((value) => StorageEntryModifier[StorageEntryModifier[value]])
    const type = decoder.decodeNextObject(MetadataV11StorageEntryType.decode)
    const defaultValue = decoder.decodeNextBytes()
    const docs = decoder.decodeNextArray((_network, _runtimeVersion, hex) => SCALEString.decode(hex))

    return {
      bytesDecoded: name.bytesDecoded + modifier.bytesDecoded + type.bytesDecoded + defaultValue.bytesDecoded + docs.bytesDecoded,
      decoded: new MetadataV11StorageEntry(name.decoded, modifier.decoded, type.decoded, defaultValue.decoded, docs.decoded)
    }
  }

  protected scaleFields = [this.name, this.modifier, this.type, this.defaultValue]

  private constructor(
    readonly name: SCALEString,
    readonly modifier: SCALEEnum<StorageEntryModifier>,
    readonly type: MetadataV11StorageEntryType,
    readonly defaultValue: SCALEBytes,
    readonly docs: SCALEArray<SCALEString>
  ) {
    super()
  }
}
