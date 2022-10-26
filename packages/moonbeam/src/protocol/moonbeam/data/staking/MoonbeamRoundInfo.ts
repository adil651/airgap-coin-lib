import { SCALEDecoder } from '@airgap/substrate/protocol/common/data/scale/SCALEDecoder'
import { SCALEInt } from '@airgap/substrate/protocol/common/data/scale/type/SCALEInt'
import { SubstrateNetwork } from '@airgap/substrate/protocol/SubstrateNetwork'

export class MoonbeamRoundInfo {
  public static decode(runtimeVersion: number | undefined, raw: string): MoonbeamRoundInfo {
    const decoder = new SCALEDecoder(SubstrateNetwork.MOONBEAM, runtimeVersion, raw)

    const current = decoder.decodeNextInt(32)
    const first = decoder.decodeNextInt(32)
    const length = decoder.decodeNextInt(32)

    return new MoonbeamRoundInfo(current.decoded, first.decoded, length.decoded)
  }

  private constructor(public readonly current: SCALEInt, public readonly first: SCALEInt, public readonly length: SCALEInt) {}
}
