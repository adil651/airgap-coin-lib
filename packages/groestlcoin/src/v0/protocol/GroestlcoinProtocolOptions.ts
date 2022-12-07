import * as bitGoUTXO from '@airgap/coinlib-core/dependencies/src/bitgo-utxo-lib-5d91049fd7a988382df81c8260e244ee56d57aac/src/index'
import { ProtocolBlockExplorer } from '@airgap/coinlib-core/utils/ProtocolBlockExplorer'
import { NetworkType, ProtocolNetwork } from '@airgap/coinlib-core/utils/ProtocolNetwork'
import { ProtocolOptions } from '@airgap/coinlib-core/utils/ProtocolOptions'

// tslint:disable:max-classes-per-file

const MAINNET_NAME: string = 'Mainnet'

const NODE_URL: string = ''

const BLOCK_EXPLORER_URL: string = 'https://chainz.cryptoid.info/grs'
const INDEXER_API: string = `https://cors-proxy.airgap.prod.gke.papers.tech/proxy?url=${'https://blockbook.groestlcoin.org'}`

export class GroestlcoinProtocolNetworkExtras {
  constructor(public readonly indexerApi: string = INDEXER_API, public readonly network: any = bitGoUTXO.networks.groestlcoin) {}
}

export class CryptoidBlockExplorer implements ProtocolBlockExplorer {
  constructor(public readonly blockExplorer: string = BLOCK_EXPLORER_URL) {}

  public async getAddressLink(address: string): Promise<string> {
    return `${this.blockExplorer}/address.dws?${address}.htm`
  }
  public async getTransactionLink(transactionId: string): Promise<string> {
    return `${this.blockExplorer}/tx.dws?${transactionId}.htm`
  }
}

export class GroestlcoinProtocolNetwork extends ProtocolNetwork<GroestlcoinProtocolNetworkExtras> {
  constructor(
    name: string = MAINNET_NAME,
    type: NetworkType = NetworkType.MAINNET,
    rpcUrl: string = NODE_URL,
    blockExplorer: ProtocolBlockExplorer = new CryptoidBlockExplorer(),
    extras: GroestlcoinProtocolNetworkExtras = new GroestlcoinProtocolNetworkExtras()
  ) {
    super(name, type, rpcUrl, blockExplorer, extras)
  }
}

export class GroestlcoinProtocolConfig {
  constructor(public readonly bitcoinJSLib: any = bitGoUTXO) {}
}

export class GroestlcoinProtocolOptions implements ProtocolOptions<GroestlcoinProtocolConfig> {
  constructor(
    public readonly network: GroestlcoinProtocolNetwork = new GroestlcoinProtocolNetwork(),
    public readonly config: GroestlcoinProtocolConfig = new GroestlcoinProtocolConfig()
  ) {}
}
