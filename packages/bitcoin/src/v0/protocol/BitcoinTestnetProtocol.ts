import * as bitcoinJS from '@airgap/coinlib-core/dependencies/src/bitgo-utxo-lib-5d91049fd7a988382df81c8260e244ee56d57aac/src/index'
import { NetworkType } from '@airgap/coinlib-core/utils/ProtocolNetwork'

import { BitcoinProtocol } from './BitcoinProtocol'
import {
  BitcoinProtocolConfig,
  BitcoinProtocolNetwork,
  BitcoinProtocolNetworkExtras,
  BitcoinProtocolOptions,
  BlockcypherBlockExplorer
} from './BitcoinProtocolOptions'

export class BitcoinTestnetProtocol extends BitcoinProtocol {
  public name = 'Bitcoin Testnet'

  public standardDerivationPath = `m/44'/1'/0'`
  public addressValidationPattern = '^..[13][a-km-zA-HJ-NP-Z1-9]{25,34}$'

  constructor() {
    super(
      new BitcoinProtocolOptions(
        new BitcoinProtocolNetwork(
          'Testnet',
          NetworkType.TESTNET,
          '',
          new BlockcypherBlockExplorer('https://live.blockcypher.com/btc-testnet'),
          new BitcoinProtocolNetworkExtras('https://bitcoin.prod.gke.papers.tech', bitcoinJS.networks.testnet)
        ),
        new BitcoinProtocolConfig()
      )
    )
  }
}
