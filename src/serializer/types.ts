import BigNumber from '../dependencies/src/bignumber.js-9.0.0/bignumber'

export interface RawTezosTransaction {
  binaryTransaction: string
}

export interface RawEthereumTransaction {
  nonce: string
  gasPrice: string
  gasLimit: string
  to: string
  value: string
  chainId: number
  data: string
}

export interface IInTransaction {
  txId: string
  value: string
  vout: number
  address: string
  derivationPath?: string
}

export interface IOutTransaction {
  recipient: string
  isChange: boolean
  value: string
}

export interface RawBitcoinTransaction {
  ins: IInTransaction[]
  outs: IOutTransaction[]
}

export interface RawAeternityTransaction {
  networkId: string
  transaction: string
}
