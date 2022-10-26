import { CurrencyUnit, FeeDefaults } from '@airgap/coinlib-core/protocols/ICoinProtocol'
import { MainProtocolSymbols, ProtocolSymbols } from '@airgap/coinlib-core/utils/ProtocolSymbols'
import { SubstrateDelegateProtocol } from '@airgap/substrate/protocol/SubstrateDelegateProtocol'
import { SubstrateNetwork } from '@airgap/substrate/protocol/SubstrateNetwork'
import { SubstrateProtocolOptions } from '@airgap/substrate/protocol/SubstrateProtocolOptions'

import { PolkadotProtocolOptions } from './PolkadotProtocolOptions'

export class PolkadotProtocol extends SubstrateDelegateProtocol<SubstrateNetwork.POLKADOT> {
  public symbol: string = 'DOT'
  public name: string = 'Polkadot'
  public marketSymbol: string = 'DOT'
  public feeSymbol: string = 'DOT'

  public decimals: number = 10
  public feeDecimals: number = 10
  public identifier: ProtocolSymbols = MainProtocolSymbols.POLKADOT

  public feeDefaults: FeeDefaults = {
    low: '0.01', // 100 000 000
    medium: '0.01',
    high: '0.01'
  }

  public units: CurrencyUnit[] = [
    {
      unitSymbol: 'DOT',
      factor: '1'
    },
    {
      unitSymbol: 'mDOT',
      factor: '0.001'
    },
    {
      unitSymbol: 'uDOT',
      factor: '0.000001'
    },
    {
      unitSymbol: 'Point',
      factor: '0.000000001'
    },
    {
      unitSymbol: 'Planck',
      factor: '0.0000000001'
    }
  ]

  public standardDerivationPath: string = `m/44'/354'/0'/0/0`

  public addressIsCaseSensitive: boolean = true
  public addressValidationPattern: string = '^1[a-km-zA-HJ-NP-Z1-9]+$'
  public addressPlaceholder: string = `1ABC...`

  public defaultValidator: string = '12C9U6zSSoZ6pgwR2ksFyBLgQH6v7dkqqPCRyHceoP8MJRo2'

  public constructor(public readonly options: SubstrateProtocolOptions<SubstrateNetwork.POLKADOT> = new PolkadotProtocolOptions()) {
    super(options)
  }
}
