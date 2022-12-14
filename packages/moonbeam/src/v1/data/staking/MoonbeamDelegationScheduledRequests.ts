import { InvalidValueError } from '@airgap/coinlib-core/errors'
import { Domain } from '@airgap/coinlib-core/errors/coinlib-error'
import { SCALEAccountId, SCALEArray, SCALEClass, SCALEDecodeResult, SCALEEnum, SCALEInt, SCALEType } from '@airgap/substrate/v1'
import { DecoderMethod, SCALEDecoder } from '@airgap/substrate/v1/data/scale/SCALEDecoder'

import { MoonbeamProtocolConfiguration } from '../../types/configuration'

export enum MoonbeamDelegationActionRaw {
  REVOKE = 0,
  DECREASE
}

export abstract class MoonbeamDelegationAction extends SCALEClass {
  public static decode<C extends MoonbeamProtocolConfiguration>(
    configuration: C,
    runtimeVersion: number | undefined,
    raw: string
  ): SCALEDecodeResult<MoonbeamDelegationAction> {
    const prefix = parseInt(raw.substring(0, 2), 16)

    let decoderMethod: DecoderMethod<MoonbeamDelegationAction, C>
    switch (prefix) {
      case MoonbeamDelegationActionRaw.REVOKE:
        decoderMethod = MoonbeamDelegationStatusRevoke.decode
        break
      case MoonbeamDelegationActionRaw.DECREASE:
        decoderMethod = MoonbeamDelegationStatusDecrease.decode
        break
      default:
        throw new InvalidValueError(Domain.SUBSTRATE, 'Unknown Moonbeam delegation action')
    }

    const decoded = decoderMethod(configuration, runtimeVersion, raw.slice(2))

    return {
      bytesDecoded: 1 + decoded.bytesDecoded,
      decoded: decoded.decoded
    }
  }

  public abstract readonly type: SCALEEnum<MoonbeamDelegationActionRaw>
  public abstract readonly amount: SCALEInt
  protected abstract readonly _scaleFields: SCALEType[]

  protected get scaleFields(): SCALEType[] {
    return [this.type, this.amount, ...this._scaleFields]
  }
}

export class MoonbeamDelegationStatusRevoke extends MoonbeamDelegationAction {
  public static decode<C extends MoonbeamProtocolConfiguration>(
    configuration: C,
    runtimeVersion: number | undefined,
    raw: string
  ): SCALEDecodeResult<MoonbeamDelegationStatusRevoke> {
    const decoder = new SCALEDecoder(configuration, runtimeVersion, raw)

    const amount = decoder.decodeNextInt(128)

    return {
      bytesDecoded: amount.bytesDecoded,
      decoded: new MoonbeamDelegationStatusRevoke(amount.decoded)
    }
  }

  public readonly type: SCALEEnum<MoonbeamDelegationActionRaw> = SCALEEnum.from(MoonbeamDelegationActionRaw.REVOKE)
  protected readonly _scaleFields: SCALEType[] = []

  constructor(public readonly amount: SCALEInt) {
    super()
  }
}

export class MoonbeamDelegationStatusDecrease extends MoonbeamDelegationAction {
  public static decode<C extends MoonbeamProtocolConfiguration>(
    configuration: C,
    runtimeVersion: number | undefined,
    raw: string
  ): SCALEDecodeResult<MoonbeamDelegationStatusDecrease> {
    const decoder = new SCALEDecoder(configuration, runtimeVersion, raw)

    const amount = decoder.decodeNextInt(128)

    return {
      bytesDecoded: amount.bytesDecoded,
      decoded: new MoonbeamDelegationStatusDecrease(amount.decoded)
    }
  }

  public readonly type: SCALEEnum<MoonbeamDelegationActionRaw> = SCALEEnum.from(MoonbeamDelegationActionRaw.DECREASE)
  protected readonly _scaleFields: SCALEType[] = []

  constructor(public readonly amount: SCALEInt) {
    super()
  }
}

export class MoonbeamDelegationRequest<C extends MoonbeamProtocolConfiguration = MoonbeamProtocolConfiguration> extends SCALEClass {
  public static decode<C extends MoonbeamProtocolConfiguration>(
    configuration: C,
    runtimeVersion: number | undefined,
    raw: string
  ): SCALEDecodeResult<MoonbeamDelegationRequest<C>> {
    const decoder = new SCALEDecoder(configuration, runtimeVersion, raw)

    const delegator = decoder.decodeNextAccountId(20)
    const whenExecutable = decoder.decodeNextInt(32)
    const action = decoder.decodeNextObject(MoonbeamDelegationAction.decode)

    return {
      bytesDecoded: delegator.bytesDecoded + whenExecutable.bytesDecoded + action.bytesDecoded,
      decoded: new MoonbeamDelegationRequest(delegator.decoded, whenExecutable.decoded, action.decoded)
    }
  }

  protected scaleFields: SCALEType[] = [this.delegator, this.whenExecutable, this.action]

  private constructor(
    public readonly delegator: SCALEAccountId<C>,
    public readonly whenExecutable: SCALEInt,
    public readonly action: MoonbeamDelegationAction
  ) {
    super()
  }
}

export class MoonbeamDelegationScheduledRequests<C extends MoonbeamProtocolConfiguration = MoonbeamProtocolConfiguration> {
  public static decode<C extends MoonbeamProtocolConfiguration>(
    configuration: C,
    runtimeVersion: number | undefined,
    raw: string
  ): MoonbeamDelegationScheduledRequests<C> {
    const decoder = new SCALEDecoder(configuration, runtimeVersion, raw)

    const requests = decoder.decodeNextArray((configuration, runtimeVersion, hex) =>
      MoonbeamDelegationRequest.decode(configuration, runtimeVersion, hex)
    )

    return new MoonbeamDelegationScheduledRequests(requests.decoded)
  }

  private constructor(public readonly requests: SCALEArray<MoonbeamDelegationRequest<C>>) {}
}
