import { SubProtocolSymbols } from '@airgap/coinlib-core/utils/ProtocolSymbols'
import {
  EthereumERC20ProtocolConfig,
  EthereumERC20ProtocolOptions,
  EthereumProtocolNetwork,
  EthereumProtocolNetworkExtras
} from '../EthereumProtocolOptions'

import { GenericERC20 } from './GenericERC20'

const ERC20Token = new GenericERC20(
  new EthereumERC20ProtocolOptions(
    new EthereumProtocolNetwork(undefined, undefined, undefined, undefined, new EthereumProtocolNetworkExtras(3)),
    new EthereumERC20ProtocolConfig(
      'ETH-ERC20',
      'Unknown Ethereum ERC20-Token',
      'erc20',
      SubProtocolSymbols.ETH_ERC20,
      '0x2dd847af80418D280B7078888B6A6133083001C9',
      18
    )
  )
)

export { ERC20Token }
