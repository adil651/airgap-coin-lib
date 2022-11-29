import { UnsignedTransaction } from '@airgap/coinlib-core/types/unsigned-transaction'

interface IInTransaction {
  txId: string
  value: string
  vout: number
  address: string
  derivationPath?: string
}

interface IOutTransaction {
  recipient: string
  isChange: boolean
  value: string
  derivationPath?: string
}

interface RawBitcoinTransaction {
  ins: IInTransaction[]
  outs: IOutTransaction[]
}

export interface UnsignedBitcoinTransaction extends UnsignedTransaction {
  transaction: RawBitcoinTransaction
}
