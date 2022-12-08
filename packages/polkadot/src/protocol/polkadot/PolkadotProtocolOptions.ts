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

const NODE_URL: string = 'https://polkadot-node.prod.gke.papers.tech'

const BLOCK_EXPLORER_URL: string = 'https://polkadot.subscan.io'
const BLOCK_EXPLORER_API: string = 'https://polkadot.subscan.prod.gke.papers.tech/api/scan'

export class PolkadotProtocolNetworkExtras extends SubstrateProtocolNetworkExtras<SubstrateNetwork.POLKADOT> {
  constructor(public readonly apiUrl: string = BLOCK_EXPLORER_API) {
    super(apiUrl, SubstrateNetwork.POLKADOT)
  }
}

export class PolkadotSubscanBlockExplorer extends SubscanBlockExplorer {
  constructor(blockExplorer: string = BLOCK_EXPLORER_URL) {
    super(blockExplorer)
  }
}

export class PolkadotProtocolConfig extends SubstrateProtocolConfig {
  constructor() {
    super()
  }
}

export class PolkadotProtocolNetwork extends ProtocolNetwork<PolkadotProtocolNetworkExtras> {
  constructor(
    name: string = MAINNET_NAME,
    type: NetworkType = NetworkType.MAINNET,
    rpcUrl: string = NODE_URL,
    blockExplorer: ProtocolBlockExplorer = new PolkadotSubscanBlockExplorer(),
    extras: PolkadotProtocolNetworkExtras = new PolkadotProtocolNetworkExtras()
  ) {
    super(name, type, rpcUrl, blockExplorer, extras)
  }
}

export class PolkadotProtocolOptions extends SubstrateProtocolOptions<SubstrateNetwork.POLKADOT, PolkadotProtocolConfig> {
  constructor(
    public readonly network: PolkadotProtocolNetwork = new PolkadotProtocolNetwork(),
    public readonly config: PolkadotProtocolConfig = new PolkadotProtocolConfig(),
    nodeClient: SubstrateNodeClient<SubstrateNetwork.POLKADOT> = new SubstrateNodeClient(network.extras.network, network.rpcUrl)
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
