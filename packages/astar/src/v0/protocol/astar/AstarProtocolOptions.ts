// tslint:disable:max-classes-per-file

import { ProtocolBlockExplorer } from '@airgap/coinlib-core/utils/ProtocolBlockExplorer'
import { NetworkType, ProtocolNetwork } from '@airgap/coinlib-core/utils/ProtocolNetwork'
import { SubstrateNodeClient } from '@airgap/substrate/v0/protocol/common/node/SubstrateNodeClient'
import { SubstrateAccountController } from '@airgap/substrate/v0/protocol/common/SubstrateAccountController'
import { SubstrateTransactionController } from '@airgap/substrate/v0/protocol/common/SubstrateTransactionController'
import { SubstrateNetwork } from '@airgap/substrate/v0/protocol/SubstrateNetwork'
import {
  SubscanBlockExplorer,
  SubstrateProtocolConfig,
  SubstrateProtocolNetworkExtras,
  SubstrateProtocolOptions
} from '@airgap/substrate/v0/protocol/SubstrateProtocolOptions'

const MAINNET_NAME: string = 'Mainnet'

const NODE_URL: string = 'https://astar-node.prod.gke.papers.tech'

const BLOCK_EXPLORER_URL: string = 'https://astar.subscan.io'
const BLOCK_EXPLORER_API: string = 'https://astar.subscan.prod.gke.papers.tech/api/scan'

export class AstarProtocolConfig extends SubstrateProtocolConfig {
  constructor() {
    super()
  }
}

export class AstarSubscanBlockExplorer extends SubscanBlockExplorer {
  constructor(blockExplorer: string = BLOCK_EXPLORER_URL) {
    super(blockExplorer)
  }
}

export class AstarProtocolNetworkExtras extends SubstrateProtocolNetworkExtras<SubstrateNetwork.ASTAR> {
  constructor(public readonly apiUrl: string = BLOCK_EXPLORER_API) {
    super(apiUrl, SubstrateNetwork.ASTAR)
  }
}

export class AstarProtocolNetwork extends ProtocolNetwork<AstarProtocolNetworkExtras> {
  constructor(
    name: string = MAINNET_NAME,
    type: NetworkType = NetworkType.MAINNET,
    rpcUrl: string = NODE_URL,
    blockExplorer: ProtocolBlockExplorer = new AstarSubscanBlockExplorer(),
    extras: AstarProtocolNetworkExtras = new AstarProtocolNetworkExtras()
  ) {
    super(name, type, rpcUrl, blockExplorer, extras)
  }
}

export class BaseAstarProtocolOptions<Config extends AstarProtocolConfig = AstarProtocolConfig> extends SubstrateProtocolOptions<
  SubstrateNetwork.ASTAR,
  Config
> {
  constructor(
    public readonly network: AstarProtocolNetwork,
    public readonly config: Config,
    nodeClient: SubstrateNodeClient<SubstrateNetwork.ASTAR> = new SubstrateNodeClient(network.extras.network, network.rpcUrl)
  ) {
    super(
      network,
      config,
      nodeClient,
      new SubstrateAccountController(network.extras.network, nodeClient),
      new SubstrateTransactionController(network.extras.network, nodeClient)
    )
  }
}

export class AstarProtocolOptions extends BaseAstarProtocolOptions {
  constructor(
    public readonly network: AstarProtocolNetwork = new AstarProtocolNetwork(),
    public readonly config: AstarProtocolConfig = new AstarProtocolConfig()
  ) {
    super(network, config)
  }
}
