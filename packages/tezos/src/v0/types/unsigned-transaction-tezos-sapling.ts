import { UnsignedTransaction } from '@airgap/coinlib-core/types/unsigned-transaction'

interface TezosSaplingInput {
  rcm: string
  pos: string
  value: string
  address: string
}

interface TezosSaplingOutput {
  address: string
  value: string
  memo: string
  browsable: boolean
}

interface TezosSaplingStateDiff {
  root: string
  commitments_and_ciphertexts: [string, TezosSaplingCiphertext][]
  nullifiers: string[]
}

interface TezosSaplingCiphertext {
  cv: string
  epk: string
  payload_enc: string
  nonce_enc: string
  payload_out: string
  nonce_out: string
}

interface RawTezosSaplingTransaction {
  ins: TezosSaplingInput[]
  outs: TezosSaplingOutput[]
  contractAddress: string
  chainId: string
  stateDiff: TezosSaplingStateDiff
  unshieldTarget: string
}

export interface UnsignedTezosSaplingTransaction extends UnsignedTransaction {
  transaction: RawTezosSaplingTransaction
}
