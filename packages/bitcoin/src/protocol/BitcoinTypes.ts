import { IAirGapAddressResult, IProtocolAddressCursor } from '@airgap/coinlib-core/interfaces/IAirGapAddress'
import { IAirGapTransaction } from '@airgap/coinlib-core/interfaces/IAirGapTransaction'

export interface BitcoinTransactionCursor {
  offset: number
}

export interface BitcoinTransactionResult {
  transactions: IAirGapTransaction[]
  cursor: BitcoinTransactionCursor
}

export interface BitcoinBlockbookTransactionCursor {
  page: number
}

export interface BitcoinBlockbookTransactionResult {
  transactions: IAirGapTransaction[]
  cursor: BitcoinBlockbookTransactionCursor
}

export interface BitcoinAddressCursor extends IProtocolAddressCursor {
  hasNext: false
}

export interface BitcoinAddressResult extends IAirGapAddressResult<BitcoinAddressCursor> {}
