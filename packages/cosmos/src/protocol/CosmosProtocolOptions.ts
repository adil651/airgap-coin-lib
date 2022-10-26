import { ProtocolBlockExplorer } from '@airgap/coinlib-core/utils/ProtocolBlockExplorer'
import { NetworkType, ProtocolNetwork } from '@airgap/coinlib-core/utils/ProtocolNetwork'
import { ProtocolOptions } from '@airgap/coinlib-core/utils/ProtocolOptions'

import { CosmosNodeClient } from './CosmosNodeClient'

// tslint:disable:max-classes-per-file

const MAINNET_NAME: string = 'Mainnet'

const NODE_URL: string = 'https://cosmos-node.prod.gke.papers.tech'

const BLOCK_EXPLORER_URL: string = 'https://www.mintscan.io'

export class MintscanBlockExplorer implements ProtocolBlockExplorer {
  constructor(public readonly blockExplorer: string = BLOCK_EXPLORER_URL) {}

  public async getAddressLink(address: string): Promise<string> {
    return `${this.blockExplorer}/cosmos/account/${address}/`
  }
  public async getTransactionLink(transactionId: string): Promise<string> {
    return `${this.blockExplorer}/cosmos/txs/${transactionId}`
  }
}

export class CosmosProtocolNetwork extends ProtocolNetwork<undefined> {
  constructor(
    name: string = MAINNET_NAME,
    type: NetworkType = NetworkType.MAINNET,
    rpcUrl: string = NODE_URL,
    blockExplorer: ProtocolBlockExplorer = new MintscanBlockExplorer(),
    // tslint:disable-next-line:no-unnecessary-initializer
    extras: undefined = undefined
  ) {
    super(name, type, rpcUrl, blockExplorer, extras)
  }
}

export class CosmosProtocolConfig {
  constructor(public readonly nodeClient: CosmosNodeClient = new CosmosNodeClient(NODE_URL)) {}
}

export class CosmosProtocolOptions implements ProtocolOptions<CosmosProtocolConfig> {
  constructor(
    public readonly network: CosmosProtocolNetwork = new CosmosProtocolNetwork(),
    public readonly config: CosmosProtocolConfig = new CosmosProtocolConfig()
  ) {}
}
