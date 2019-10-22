import { generateWalletUsingDerivationPath } from '@aeternity/hd-wallet'
import axios, { AxiosError, AxiosResponse } from 'axios'
import * as bigInt from 'big-integer'
import BigNumber from 'bignumber.js'
import * as bs58check from 'bs58check'
import * as sodium from 'libsodium-wrappers'
import * as nacl from 'tweetnacl'

import { IAirGapSignedTransaction } from '../../interfaces/IAirGapSignedTransaction'
import { IAirGapTransaction } from '../../interfaces/IAirGapTransaction'
import { SignedTezosTransaction } from '../../serializer/signed-transactions/tezos-transactions.serializer'
import { RawTezosTransaction, UnsignedTezosTransaction } from '../../serializer/unsigned-transactions/tezos-transactions.serializer'
import { getSubProtocolsByIdentifier } from '../../utils/subProtocols'
import { CurrencyUnit, FeeDefaults, ICoinProtocol } from '../ICoinProtocol'
import { NonExtendedProtocol } from '../NonExtendedProtocol'

export enum TezosOperationType {
  TRANSACTION = 'transaction',
  REVEAL = 'reveal',
  ORIGINATION = 'origination',
  DELEGATION = 'delegation'
}

export interface TezosBlockMetadata {
  protocol: string
  chain_id: string
  hash: string
  metadata: TezosBlockHeader
}

export interface TezosBlockHeader {
  level: number
  proto: number
  predecessor: string
  timestamp: string
  validation_pass: number
  operations_hash: string
  fitness: string[]
  context: string
  priority: number
  proof_of_work_nonce: string
  signature: string
}

export interface TezosOperation {
  storage_limit: string
  gas_limit: string
  counter: string
  fee: string
  source: string
  kind: TezosOperationType
}

export interface TezosWrappedOperation {
  branch: string
  contents: TezosOperation[]
}

export interface TezosSpendOperation extends TezosOperation {
  destination: string
  amount: string
  kind: TezosOperationType.TRANSACTION
  code?: string
}

export interface TezosDelegationOperation extends TezosOperation {
  kind: TezosOperationType.DELEGATION
  source: string
  fee: string
  counter: string
  gas_limit: string
  storage_limit: string
  delegate?: string
}

export interface TezosOriginationOperation extends TezosOperation {
  kind: TezosOperationType.ORIGINATION
  balance: string
  counter: string
  fee: string
  gas_limit: string
  source: string
  storage_limit: string
  delegate?: string
  script?: string
}

export interface TezosRevealOperation extends TezosOperation {
  public_key: string
  kind: TezosOperationType.REVEAL
}

export interface TezosVotingInfo {
  pkh: string
  rolls: number
}

export interface DelegationInfo {
  isDelegated: boolean
  value?: string
  delegatedOpLevel?: number
  delegatedDate?: Date
}

export interface BakerInfo {
  balance: BigNumber
  delegatedBalance: BigNumber
  stakingBalance: BigNumber
  bakingActive: boolean
  selfBond: BigNumber
  bakerCapacity: BigNumber
  bakerUsage: BigNumber
}

export interface DelegationRewardInfo {
  cycle: number
  reward: BigNumber
  deposit: BigNumber
  delegatedBalance: BigNumber
  stakingBalance: BigNumber
  totalRewards: BigNumber
  totalFees: BigNumber
  payout: Date
}

export interface DelegationInfo {
  isDelegated: boolean
  value?: string
  delegatedOpLevel?: number
  delegatedDate?: Date
}

// 8.25%
const SELF_BOND_REQUIREMENT: number = 0.0825
const BLOCK_PER_CYCLE: number = 4096

export class TezosProtocol extends NonExtendedProtocol implements ICoinProtocol {
  public symbol: string = 'XTZ'
  public name: string = 'Tezos'
  public marketSymbol: string = 'xtz'
  public feeSymbol: string = 'xtz'

  public decimals: number = 6
  public feeDecimals: number = 6 // micro tez is the smallest, 1000000 microtez is 1 tez
  public identifier: string = 'xtz'

  get subProtocols() {
    return getSubProtocolsByIdentifier(this.identifier)
  }

  // tezbox default
  public feeDefaults: FeeDefaults = {
    low: new BigNumber('0.001420'),
    medium: new BigNumber('0.001520'),
    high: new BigNumber('0.003000')
  }

  public units: CurrencyUnit[] = [
    {
      unitSymbol: 'XTZ',
      factor: new BigNumber(1)
    }
  ]

  public supportsHD: boolean = false
  public standardDerivationPath: string = `m/44h/1729h/0h/0h`

  public addressIsCaseSensitive: boolean = true
  public addressValidationPattern: string = '^(tz1|KT1)[1-9A-Za-z]{33}$'
  public addressPlaceholder: string = 'tz1...'

  public blockExplorer: string = 'https://tezblock.io'

  protected readonly transactionFee: BigNumber = new BigNumber('1400')
  protected readonly originationSize: BigNumber = new BigNumber('257')
  protected readonly storageCostPerByte: BigNumber = new BigNumber('1000')

  protected readonly revealFee: BigNumber = new BigNumber('1300')
  protected readonly activationBurn: BigNumber = this.originationSize.times(this.storageCostPerByte)
  protected readonly originationBurn: BigNumber = this.originationSize.times(this.storageCostPerByte) // https://tezos.stackexchange.com/a/787

  // Tezos - We need to wrap these in Buffer due to non-compatible browser polyfills
  protected readonly tezosPrefixes: {
    tz1: Buffer
    tz2: Buffer
    tz3: Buffer
    kt: Buffer
    edpk: Buffer
    edsk: Buffer
    edsig: Buffer
    branch: Buffer
  } = {
    tz1: Buffer.from(new Uint8Array([6, 161, 159])),
    tz2: Buffer.from(new Uint8Array([6, 161, 161])),
    tz3: Buffer.from(new Uint8Array([6, 161, 164])),
    kt: Buffer.from(new Uint8Array([2, 90, 121])),
    edpk: Buffer.from(new Uint8Array([13, 15, 37, 217])),
    edsk: Buffer.from(new Uint8Array([43, 246, 78, 7])),
    edsig: Buffer.from(new Uint8Array([9, 245, 205, 134, 18])),
    branch: Buffer.from(new Uint8Array([1, 52]))
  }

  protected readonly headers = { 'Content-Type': 'application/json', apiKey: 'airgap00391' }

  /**
   * Tezos Implemention of ICoinProtocol
   * @param jsonRPCAPI
   * @param baseApiUrl
   */
  constructor(
    public jsonRPCAPI = 'https://tezos-node.prod.gke.papers.tech',
    public baseApiUrl = 'https://conseil-prod.cryptonomic-infra.tech'
  ) {
    super()
  }

  public getBlockExplorerLinkForAddress(address: string): string {
    return `${this.blockExplorer}/account/{{address}}`.replace('{{address}}', address)
  }

  public getBlockExplorerLinkForTxId(txId: string): string {
    return `${this.blockExplorer}/transaction/{{txId}}`.replace('{{txId}}', txId)
  }

  /**
   * Returns the PublicKey as String, derived from a supplied hex-string
   * @param secret HEX-Secret from BIP39
   * @param derivationPath DerivationPath for Key
   */
  public getPublicKeyFromHexSecret(secret: string, derivationPath: string): string {
    // both AE and Tezos use the same ECC curves (ed25519)
    const { publicKey }: { publicKey: string } = generateWalletUsingDerivationPath(Buffer.from(secret, 'hex'), derivationPath)

    return Buffer.from(publicKey).toString('hex')
  }

  /**
   * Returns the PrivateKey as Buffer, derived from a supplied hex-string
   * @param secret HEX-Secret from BIP39
   * @param derivationPath DerivationPath for Key
   */
  public getPrivateKeyFromHexSecret(secret: string, derivationPath: string): Buffer {
    // both AE and Tezos use the same ECC curves (ed25519)
    const { secretKey }: { secretKey: string } = generateWalletUsingDerivationPath(Buffer.from(secret, 'hex'), derivationPath)

    return Buffer.from(secretKey)
  }

  public async getAddressFromPublicKey(publicKey: string): Promise<string> {
    await sodium.ready

    const payload: Uint8Array = sodium.crypto_generichash(20, Buffer.from(publicKey, 'hex'))
    const address: string = bs58check.encode(Buffer.concat([this.tezosPrefixes.tz1, Buffer.from(payload)]))

    return address
  }

  public async getAddressesFromPublicKey(publicKey: string): Promise<string[]> {
    const address: string = await this.getAddressFromPublicKey(publicKey)

    return [address]
  }

  public async getTransactionsFromPublicKey(publicKey: string, limit: number, offset: number): Promise<IAirGapTransaction[]> {
    const addresses: string[] = await this.getAddressesFromPublicKey(publicKey)

    return this.getTransactionsFromAddresses(addresses, limit, offset)
  }

  public async getTransactionsFromAddresses(addresses: string[], limit: number, offset: number): Promise<IAirGapTransaction[]> {
    // TODO: implement pagination
    if (offset !== 0) {
      return []
    }
    const allTransactions = await Promise.all(
      addresses.map(address => {
        const getRequestBody = (field: string, set: string) => {
          return {
            predicates: [
              {
                field: field,
                operation: 'eq',
                set: [address],
                inverse: false
              },
              {
                field: 'kind',
                operation: 'eq',
                set: [set],
                inverse: false
              }
            ],
            limit: limit
          }
        }
        return new Promise<any>(async (resolve, reject) => {
          const fromPromise = axios
            .post(`${this.baseApiUrl}/v2/data/tezos/mainnet/operations`, getRequestBody('source', 'transaction'), {
              headers: this.headers
            })
            .catch(() => {
              return { data: [] }
            })
          const toPromise = axios
            .post(`${this.baseApiUrl}/v2/data/tezos/mainnet/operations`, getRequestBody('destination', 'transaction'), {
              headers: this.headers
            })
            .catch(() => {
              return { data: [] }
            })
          const [to, from] = await Promise.all([fromPromise, toPromise])
          const transactions: any[] = to.data.concat(from.data)
          transactions.sort((a, b) => a.timestamp - b.timestamp)
          resolve([...to.data, ...from.data])
        })
      })
    )
    return allTransactions.reduce((current, next) => current.concat(next)).map((transaction: any) => {
      return {
        amount: new BigNumber(transaction.amount),
        fee: new BigNumber(transaction.fee),
        from: [transaction.source],
        isInbound: addresses.indexOf(transaction.destination) !== -1,
        protocolIdentifier: this.identifier,
        to: [transaction.destination],
        hash: transaction.operation_group_hash,
        timestamp: transaction.timestamp / 1000,
        blockHeight: transaction.block_level
      } as IAirGapTransaction
    })
  }

  public async signWithPrivateKey(privateKey: Buffer, transaction: RawTezosTransaction): Promise<IAirGapSignedTransaction> {
    await sodium.ready

    const watermark: string = '03'
    const watermarkedForgedOperationBytesHex: string = watermark + transaction.binaryTransaction
    const watermarkedForgedOperationBytes: Buffer = Buffer.from(watermarkedForgedOperationBytesHex, 'hex')
    const hashedWatermarkedOpBytes: Buffer = sodium.crypto_generichash(32, watermarkedForgedOperationBytes)

    const opSignature: Uint8Array = nacl.sign.detached(hashedWatermarkedOpBytes, privateKey)
    const signedOpBytes: Buffer = Buffer.concat([Buffer.from(transaction.binaryTransaction, 'hex'), Buffer.from(opSignature)])

    return signedOpBytes.toString('hex')
  }

  public async getTransactionDetails(unsignedTx: UnsignedTezosTransaction): Promise<IAirGapTransaction> {
    const binaryTransaction: string = unsignedTx.transaction.binaryTransaction
    const wrappedOperations: TezosWrappedOperation = this.unforgeUnsignedTezosWrappedOperation(binaryTransaction)

    return this.getAirGapTxFromWrappedOperations(wrappedOperations)
  }

  public async getTransactionDetailsFromSigned(signedTx: SignedTezosTransaction): Promise<IAirGapTransaction> {
    const binaryTransaction: string = signedTx.transaction
    const wrappedOperations: TezosWrappedOperation = this.unforgeSignedTezosWrappedOperation(binaryTransaction)

    return this.getAirGapTxFromWrappedOperations(wrappedOperations)
  }

  private getAirGapTxFromWrappedOperations(wrappedOperations: TezosWrappedOperation): IAirGapTransaction {
    const tezosOperation: TezosOperation = wrappedOperations.contents[wrappedOperations.contents.length - 1]

    let amount: BigNumber = new BigNumber(0)
    let to: string[] = ['']

    switch (tezosOperation.kind) {
      case TezosOperationType.TRANSACTION:
        amount = new BigNumber((tezosOperation as TezosSpendOperation).amount)
        to = [(tezosOperation as TezosSpendOperation).destination]

        break
      case TezosOperationType.ORIGINATION:
        {
          const tezosOriginationOperation: TezosOriginationOperation = tezosOperation as TezosOriginationOperation
          amount = new BigNumber(tezosOriginationOperation.balance)
          const delegate: string | undefined = tezosOriginationOperation.delegate
          to = [delegate ? `Delegate: ${delegate}` : 'Origination']
        }
        break
      case TezosOperationType.DELEGATION:
        {
          const delegate: string | undefined = (tezosOperation as TezosDelegationOperation).delegate
          to = [delegate ? delegate : 'Undelegate']
        }
        break
      default:
        throw new Error('no operation to unforge found')
    }

    const airgapTx: IAirGapTransaction = {
      amount,
      fee: new BigNumber(tezosOperation.fee),
      from: [tezosOperation.source],
      isInbound: false,
      protocolIdentifier: this.identifier,
      to
    }

    return airgapTx
  }

  public async getBalanceOfAddresses(addresses: string[]): Promise<BigNumber> {
    let balance: BigNumber = new BigNumber(0)

    for (const address of addresses) {
      try {
        const { data }: AxiosResponse = await axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/contracts/${address}/balance`)
        balance = balance.plus(new BigNumber(data))
      } catch (error) {
        // if node returns 404 (which means 'no account found'), go with 0 balance
        if (error.response && error.response.status !== 404) {
          throw error
        }
      }
    }

    return balance
  }

  public async getBalanceOfPublicKey(publicKey: string): Promise<BigNumber> {
    const address: string = await this.getAddressFromPublicKey(publicKey)

    return this.getBalanceOfAddresses([address])
  }

  public async prepareTransactionFromPublicKey(
    publicKey: string,
    recipients: string[],
    values: BigNumber[],
    fee: BigNumber,
    data?: { addressIndex: number }
  ): Promise<RawTezosTransaction> {
    if (recipients.length !== values.length) {
      throw new Error('length of recipients and values does not match!')
    }

    let counter = new BigNumber(1)
    let branch: string

    const operations: TezosOperation[] = []

    // check if we got an address-index
    const addressIndex = data && data.addressIndex ? data.addressIndex : 0
    const addresses = await this.getAddressesFromPublicKey(publicKey)

    if (!addresses[addressIndex]) {
      throw new Error('no kt-address with this index exists')
    }

    const address = addresses[addressIndex]

    try {
      const results = await Promise.all([
        axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/contracts/${address}/counter`),
        axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/hash`),
        axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/contracts/${address}/manager_key`)
      ])

      counter = new BigNumber(results[0].data).plus(1)
      branch = results[1].data

      const accountManager = results[2].data

      // check if we have revealed the address already
      if (!accountManager) {
        operations.push(await this.createRevealOperation(counter, publicKey, address))
        counter = counter.plus(1)
      }
    } catch (error) {
      throw error
    }

    const balance = await this.getBalanceOfPublicKey(publicKey)
    const receivingBalance = await this.getBalanceOfAddresses(recipients)

    const amountUsedByPreviousOperations = this.getAmountUsedByPreviousOperations(operations)

    if (!amountUsedByPreviousOperations.isZero()) {
      if (balance.isLessThan(values[0].plus(fee).plus(amountUsedByPreviousOperations))) {
        // if not, make room for the init fee
        values[0] = values[0].minus(amountUsedByPreviousOperations) // deduct fee from balance
      }
    }

    for (let i = 0; i < recipients.length; i++) {
      // if our receiver has 0 balance, the account is not activated yet.
      if (receivingBalance.isZero() && recipients[i].toLowerCase().startsWith('tz')) {
        // We have to supply an additional 0.257 XTZ fee for storage_limit costs, which gets automatically deducted from the sender so we just have to make sure enough balance is around
        // check whether the sender has enough to cover the amount to send + fee + activation
        if (balance.isLessThan(values[i].plus(fee).plus(this.activationBurn))) {
          // if not, make room for the init fee
          values[i] = values[i].minus(this.activationBurn) // deduct fee from balance
        }
      }

      if (balance.isEqualTo(values[i].plus(fee))) {
        // Tezos accounts can never be empty. If user tries to send everything, we must leave 1 mutez behind.
        values[i] = values[i].minus(1)
      } else if (balance.isLessThan(values[i].plus(fee))) {
        throw new Error('not enough balance')
      }

      const adjustedFee: BigNumber = recipients[0].toLowerCase().startsWith('kt') ? fee.plus(500) : fee

      const spendOperation: TezosSpendOperation = {
        kind: TezosOperationType.TRANSACTION,
        fee: adjustedFee.toFixed(),
        gas_limit: recipients[i].toLowerCase().startsWith('kt') ? '15385' : '10300',
        storage_limit: receivingBalance.isZero() && recipients[i].toLowerCase().startsWith('tz') ? '300' : '0', // taken from eztz
        amount: values[i].toFixed(),
        counter: counter.plus(i).toFixed(),
        destination: recipients[i],
        source: address
      }

      operations.push(spendOperation)
    }

    try {
      const tezosWrappedOperation: TezosWrappedOperation = {
        branch: branch,
        contents: operations
      }

      console.log('wrapped operation', tezosWrappedOperation)

      const binaryTx = this.forgeTezosOperation(tezosWrappedOperation)

      return { binaryTransaction: binaryTx }
    } catch (error) {
      console.warn(error.message)
      throw new Error('Forging Tezos TX failed.')
    }
  }

  public async isAddressDelegated(delegatedAddress: string): Promise<DelegationInfo> {
    const { data } = await axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/contracts/${delegatedAddress}`)
    let delegatedOpLevel: number | undefined
    let delegatedDate: Date | undefined

    // if the address is delegated, check since when
    if (data.delegate) {
      const getDataFromMostRecentTransaction = (transactions): { date: Date; opLevel: number } | void => {
        if (transactions.length > 0) {
          const mostRecentTransaction = transactions[0]

          return {
            date: new Date(mostRecentTransaction.timestamp),
            opLevel: mostRecentTransaction.block_level
          }
        }
      }
      const getRequestBody = (field: string, set: string) => {
        return {
          predicates: [
            {
              field: field,
              operation: 'eq',
              set: [delegatedAddress],
              inverse: false
            },
            {
              field: 'kind',
              operation: 'eq',
              set: [set],
              inverse: false
            }
          ],
          orderBy: [
            {
              field: 'block_level',
              direction: 'desc'
            }
          ]
        }
      }

      // We first try to get the data from the lastest delegation
      // After that try to get it from the origination
      const transactionSourceUrl = `${this.baseApiUrl}/v2/data/tezos/mainnet/operations`
      const results = await Promise.all([
        axios
          .post(transactionSourceUrl, getRequestBody('source', 'delegation'), {
            headers: this.headers
          })
          .catch(() => {
            return { data: [] }
          }),
        axios
          .post(transactionSourceUrl, getRequestBody('manager_pubkey', 'origination'), {
            headers: this.headers
          })
          .catch(() => {
            return { data: [] }
          })
      ])

      const combinedData = results[0].data.concat(results[1].data)

      const recentTransactionData = getDataFromMostRecentTransaction(combinedData)
      if (recentTransactionData) {
        delegatedDate = recentTransactionData.date
        delegatedOpLevel = recentTransactionData.opLevel
      }
    }

    return {
      isDelegated: data.delegate ? true : false,
      value: data.delegate,
      delegatedDate,
      delegatedOpLevel
    }
  }

  public async bakerInfo(tzAddress: string): Promise<BakerInfo> {
    if (
      !(tzAddress.toLowerCase().startsWith('tz1') || tzAddress.toLowerCase().startsWith('tz2') || tzAddress.toLowerCase().startsWith('tz3'))
    ) {
      throw new Error('non tz-address supplied')
    }

    const results: AxiosResponse[] = await Promise.all([
      axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/delegates/${tzAddress}/balance`),
      axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/delegates/${tzAddress}/delegated_balance`),
      axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/delegates/${tzAddress}/staking_balance`),
      axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/delegates/${tzAddress}/deactivated`)
    ])

    const tzBalance: BigNumber = new BigNumber(results[0].data)
    const delegatedBalance: BigNumber = new BigNumber(results[1].data)
    const stakingBalance: BigNumber = new BigNumber(results[2].data)
    const isBakingActive: boolean = !results[3].data // we need to negate as the query is "deactivated"

    // calculate the self bond of the baker
    const selfBond: BigNumber = stakingBalance.minus(delegatedBalance)

    // check what capacity is staked relatively to the self-bond
    const stakingCapacity: BigNumber = stakingBalance.div(selfBond.div(SELF_BOND_REQUIREMENT))

    const bakerInfo: BakerInfo = {
      balance: tzBalance,
      delegatedBalance,
      stakingBalance,
      bakingActive: isBakingActive,
      selfBond,
      bakerCapacity: stakingBalance.div(stakingCapacity),
      bakerUsage: stakingCapacity
    }

    return bakerInfo
  }

  public async delegationInfo(address: string): Promise<DelegationRewardInfo[]> {
    const status: DelegationInfo = await this.isAddressDelegated(address)

    if (!status.isDelegated || !status.value) {
      throw new Error('address not delegated')
    }

    return this.delegationRewards(status.value, address)
  }

  public async delegationRewards(bakerAddress: string, delegatorAddress?: string): Promise<DelegationRewardInfo[]> {
    const { data: frozenBalance }: AxiosResponse<[{ cycle: number; deposit: string; fees: string; rewards: string }]> = await axios.get(
      `${this.jsonRPCAPI}/chains/main/blocks/head/context/delegates/${bakerAddress}/frozen_balance_by_cycle`
    )

    const lastConfirmedCycle: number = frozenBalance[0].cycle - 1
    const mostRecentCycle: number = frozenBalance[frozenBalance.length - 1].cycle

    const { data: mostRecentBlock } = await axios.get(`${this.jsonRPCAPI}/chains/main/blocks/${mostRecentCycle * BLOCK_PER_CYCLE}`)
    const timestamp: Date = new Date(mostRecentBlock.header.timestamp)

    const delegationInfo: DelegationRewardInfo[] = await Promise.all(
      frozenBalance.map(async obj => {
        const { data: delegatedBalanceAtCycle } = await axios.get(
          `${this.jsonRPCAPI}/chains/main/blocks/${(obj.cycle - 6) * BLOCK_PER_CYCLE}/context/contracts/${
            delegatorAddress ? delegatorAddress : bakerAddress
          }/balance`
        )

        const { data: stakingBalanceAtCycle } = await axios.get(
          `${this.jsonRPCAPI}/chains/main/blocks/${(obj.cycle - 6) * BLOCK_PER_CYCLE}/context/delegates/${bakerAddress}/staking_balance`
        )

        return {
          cycle: obj.cycle,
          totalRewards: new BigNumber(obj.rewards),
          totalFees: new BigNumber(obj.fees),
          deposit: new BigNumber(obj.deposit),
          delegatedBalance: new BigNumber(delegatedBalanceAtCycle),
          stakingBalance: new BigNumber(stakingBalanceAtCycle),
          reward: new BigNumber(obj.rewards).plus(obj.fees).multipliedBy(new BigNumber(delegatedBalanceAtCycle).div(stakingBalanceAtCycle)),
          payout: new Date(timestamp.getTime() + (obj.cycle - lastConfirmedCycle) * BLOCK_PER_CYCLE * 60 * 1000)
        }
      })
    )

    return delegationInfo
  }

  public async undelegate(publicKey: string): Promise<RawTezosTransaction> {
    return this.delegate(publicKey)
  }

  public async delegate(publicKey: string, delegate?: string): Promise<RawTezosTransaction> {
    let counter: BigNumber = new BigNumber(1)
    let branch: string

    const operations: TezosOperation[] = []
    const tzAddress: string = await this.getAddressFromPublicKey(publicKey)

    try {
      const results: AxiosResponse[] = await Promise.all([
        axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/contracts/${tzAddress}/counter`),
        axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/hash`),
        axios.get(`${this.jsonRPCAPI}/chains/main/blocks/head/context/contracts/${tzAddress}/manager_key`)
      ])

      counter = new BigNumber(results[0].data).plus(1)
      branch = results[1].data

      const accountManager: string = results[2].data

      // check if we have revealed the address already
      if (!accountManager) {
        operations.push(await this.createRevealOperation(counter, publicKey, tzAddress))
        counter = counter.plus(1)
      }
    } catch (error) {
      throw error
    }

    const balance: BigNumber = await this.getBalanceOfAddresses([tzAddress])

    const fee: BigNumber = new BigNumber(1420)

    if (balance.isLessThan(fee)) {
      throw new Error('not enough balance')
    }

    const delegationOperation: TezosDelegationOperation = {
      kind: TezosOperationType.DELEGATION,
      source: tzAddress,
      fee: fee.toFixed(),
      counter: counter.toFixed(),
      gas_limit: '10000', // taken from eztz
      storage_limit: '0', // taken from eztz
      delegate
    }

    operations.push(delegationOperation)

    try {
      const tezosWrappedOperation: TezosWrappedOperation = {
        branch,
        contents: operations
      }

      const binaryTx: string = this.forgeTezosOperation(tezosWrappedOperation)

      return { binaryTransaction: binaryTx }
    } catch (error) {
      console.warn(error)
      throw new Error('Forging Tezos TX failed.')
    }
  }

  private getAmountUsedByPreviousOperations(operations: TezosOperation[]): BigNumber {
    let amountUsed: BigNumber = new BigNumber(0)
    const assertNever: (x: never) => void = (x: never): void => undefined

    operations.forEach((operation: TezosOperation) => {
      amountUsed = amountUsed.plus(operation.fee) // Fee has to be added for every operation type

      switch (operation.kind) {
        case TezosOperationType.REVEAL:
          // const revealOperation = operation as TezosRevealOperation
          // No additional amount/fee
          break
        case TezosOperationType.ORIGINATION:
          const originationOperation: TezosOriginationOperation = operation as TezosOriginationOperation
          amountUsed = amountUsed.plus(originationOperation.balance)
          break
        case TezosOperationType.DELEGATION:
          // const delegationOperation = operation as TezosDelegationOperation
          // No additional amount/fee
          break
        case TezosOperationType.TRANSACTION:
          const spendOperation: TezosSpendOperation = operation as TezosSpendOperation
          amountUsed = amountUsed.plus(spendOperation.amount)
          break
        default:
          assertNever(operation.kind) // Exhaustive if
      }
    })

    return amountUsed
  }

  public async broadcastTransaction(rawTransaction: IAirGapSignedTransaction): Promise<string> {
    const payload: IAirGapSignedTransaction = rawTransaction

    try {
      const { data: injectionResponse }: { data: string } = await axios.post(
        `${this.jsonRPCAPI}/injection/operation?chain=main`,
        JSON.stringify(payload),
        {
          headers: { 'content-type': 'application/json' }
        }
      )

      // returns hash if successful
      return injectionResponse
    } catch (err) {
      console.warn((err as AxiosError).message, ((err as AxiosError).response as AxiosResponse).statusText)
      throw new Error(`broadcasting failed ${err}`)
    }
  }

  protected checkAndRemovePrefixToHex(base58CheckEncodedPayload: string, tezosPrefix: Uint8Array): string {
    const prefixHex: string = Buffer.from(tezosPrefix).toString('hex')
    const payload: string = bs58check.decode(base58CheckEncodedPayload).toString('hex')
    if (payload.startsWith(prefixHex)) {
      return payload.substring(tezosPrefix.length * 2)
    } else {
      throw new Error(`payload did not match prefix: ${prefixHex}`)
    }
  }

  protected prefixAndBase58CheckEncode(hexStringPayload: string, tezosPrefix: Uint8Array): string {
    const prefixHex: string = Buffer.from(tezosPrefix).toString('hex')

    return bs58check.encode(Buffer.from(prefixHex + hexStringPayload, 'hex'))
  }

  protected splitAndReturnRest(payload: string, length: number): { result: string; rest: string } {
    const result: string = payload.substr(0, length)
    const rest: string = payload.substr(length, payload.length - length)

    return { result, rest }
  }

  protected parseAddress(rawHexAddress: string): string {
    const { result, rest }: { result: string; rest: string } = this.splitAndReturnRest(rawHexAddress, 2)
    const contractIdTag: string = result
    if (contractIdTag === '00') {
      // tz address
      return this.parseTzAddress(rest)
    } else if (contractIdTag === '01') {
      // kt address
      return this.prefixAndBase58CheckEncode(rest.slice(0, -2), this.tezosPrefixes.kt)
    } else {
      throw new Error('address format not supported')
    }
  }

  protected parseTzAddress(rawHexAddress: string): string {
    // tz1 address
    const { result, rest }: { result: string; rest: string } = this.splitAndReturnRest(rawHexAddress, 2)
    const publicKeyHashTag: string = result
    if (publicKeyHashTag === '00') {
      return this.prefixAndBase58CheckEncode(rest, this.tezosPrefixes.tz1)
    } else {
      throw new Error('address format not supported')
    }
  }

  protected parsePublicKey(rawHexPublicKey: string): string {
    const { result, rest }: { result: string; rest: string } = this.splitAndReturnRest(rawHexPublicKey, 2)
    const tag: string = result
    if (tag === '00') {
      // tz1 address
      return this.prefixAndBase58CheckEncode(rest, this.tezosPrefixes.edpk)
    } else {
      throw new Error('public key format not supported')
    }
  }

  private checkBoolean(hexString: string): boolean {
    if (hexString === 'ff') {
      return true
    } else if (hexString === '00') {
      return false
    } else {
      throw new Error('Boolean value invalid!')
    }
  }

  public unforgeSignedTezosWrappedOperation(hexString: string): TezosWrappedOperation {
    if (hexString.length <= 128) {
      throw new Error('Not a valid signed transaction')
    }

    return this.unforgeUnsignedTezosWrappedOperation(hexString.substring(0, hexString.length - 128))
  }

  public unforgeUnsignedTezosWrappedOperation(hexString: string): TezosWrappedOperation {
    let { result, rest }: { result: string; rest: string } = this.splitAndReturnRest(hexString, 64)
    const branch: string = this.prefixAndBase58CheckEncode(result, this.tezosPrefixes.branch)

    const tezosWrappedOperation: TezosWrappedOperation = {
      branch,
      contents: []
    }

    while (rest.length > 0) {
      ;({ result, rest } = this.splitAndReturnRest(rest, 2))
      const kindHexString: string = result

      switch (kindHexString) {
        case '07':
        case '08':
        case '09':
        case '0a':
          throw new Error(`deprecated operations found with tag ${kindHexString}`)
        case '6b':
          let tezosRevealOperation: TezosRevealOperation
          ;({ tezosRevealOperation, rest } = this.unforgeRevealOperation(rest))
          tezosWrappedOperation.contents.push(tezosRevealOperation)
          break
        case '6c':
          let tezosSpendOperation: TezosSpendOperation
          ;({ tezosSpendOperation, rest } = this.unforgeSpendOperation(rest))
          tezosWrappedOperation.contents.push(tezosSpendOperation)
          break
        case '6d':
          let tezosOriginationOperation: TezosOriginationOperation
          ;({ tezosOriginationOperation, rest } = this.unforgeOriginationOperation(rest))
          tezosWrappedOperation.contents.push(tezosOriginationOperation)
          break
        case '6e':
          let tezosDelegationOperation: TezosDelegationOperation
          ;({ tezosDelegationOperation, rest } = this.unforgeDelegationOperation(rest))
          tezosWrappedOperation.contents.push(tezosDelegationOperation)
          break
        default:
          throw new Error(`transaction operation unknown ${kindHexString}`)
      }
    }

    return tezosWrappedOperation
  }

  public unforgeRevealOperation(hexString: string): { tezosRevealOperation: TezosRevealOperation; rest: string } {
    let { result, rest }: { result: string; rest: string } = this.splitAndReturnRest(hexString, 42)
    const source: string = this.parseTzAddress(result)

    // fee, counter, gas_limit, storage_limit
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const fee: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const counter: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const gasLimit: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const storageLimit: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, 66))
    const publicKey: string = this.parsePublicKey(result)

    return {
      tezosRevealOperation: {
        kind: TezosOperationType.REVEAL,
        fee: fee.toFixed(),
        gas_limit: gasLimit.toFixed(),
        storage_limit: storageLimit.toFixed(),
        counter: counter.toFixed(),
        public_key: publicKey,
        source
      },
      rest
    }
  }

  public unforgeSpendOperation(hexString: string): { tezosSpendOperation: TezosSpendOperation; rest: string } {
    let { result, rest }: { result: string; rest: string } = this.splitAndReturnRest(hexString, 42)
    let source: string = this.parseTzAddress(result)

    // fee, counter, gas_limit, storage_limit, amount
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const fee: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const counter: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const gasLimit: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const storageLimit: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    let amount: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, 44))
    let destination: string = this.parseAddress(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, 2))
    const hasParameters: boolean = this.checkBoolean(result)

    let contractData: { amount: BigNumber; destination: string } | undefined
    if (hasParameters) {
      ;({ result: contractData, rest } = this.unforgeParameters(rest))
    }

    if (contractData) {
      // This is a migration contract, so we can display more meaningful data to the user
      if (!amount.isZero()) {
        throw new Error('Amount has to be zero for contract calls.')
      }
      source = destination
      amount = contractData.amount
      destination = contractData.destination
    }

    return {
      tezosSpendOperation: {
        kind: TezosOperationType.TRANSACTION,
        fee: fee.toFixed(),
        gas_limit: gasLimit.toFixed(),
        storage_limit: storageLimit.toFixed(),
        amount: amount.toFixed(),
        counter: counter.toFixed(),
        destination,
        source
      },
      rest
    }
  }

  public unforgeParameters(hexString: string): { result: { amount: BigNumber; destination: string }; rest: string } {
    // We can only unforge one specific contract call right now
    let { result, rest }: { result: string; rest: string } = this.splitAndReturnRest(hexString, 2) // Entrypoint
    ;({ result, rest } = this.splitAndReturnRest(rest, 8)) // Argument length
    const argumentLength: BigNumber = new BigNumber(result, 16)
    ;({ result, rest } = this.splitAndReturnRest(rest, 40)) // Contract data
    ;({ result, rest } = this.splitAndReturnRest(rest, 42)) // Sequence length
    const destination: string = this.parseTzAddress(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, 12)) // Contract data
    ;({ result, rest } = this.splitAndReturnRest(
      rest,
      argumentLength
        .times(2)
        .minus(40 + 42 + 12 + 12)
        .toNumber()
    )) // Contract data

    const amount: BigNumber = new BigNumber(this.decodeSignedInt(result.substr(2, result.length)))
    ;({ result, rest } = this.splitAndReturnRest(rest, 12)) // Contract data

    return { result: { amount, destination }, rest }
  }

  public unforgeOriginationOperation(hexString: string): { tezosOriginationOperation: TezosOriginationOperation; rest: string } {
    let { result, rest }: { result: string; rest: string } = this.splitAndReturnRest(hexString, 42)
    const source: string = this.parseTzAddress(result)

    // fee, counter, gas_limit, storage_limit
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const fee: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const counter: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const gasLimit: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const storageLimit: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const balance: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, 2))
    const hasDelegate: boolean = this.checkBoolean(result)
    let delegate: string | undefined
    if (hasDelegate) {
      // Delegate is optional
      ;({ result, rest } = this.splitAndReturnRest(rest, 42))
      delegate = this.parseAddress(`00${result}`)
    }

    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const script: BigNumber = this.zarithToBigNumber(result) // TODO: What is the type here?

    return {
      tezosOriginationOperation: {
        source,
        kind: TezosOperationType.ORIGINATION,
        fee: fee.toFixed(),
        gas_limit: gasLimit.toFixed(),
        storage_limit: storageLimit.toFixed(),
        counter: counter.toFixed(),
        balance: balance.toFixed(),
        delegate,
        script: script ? script.toString() : undefined
      },
      rest
    }
  }

  public unforgeDelegationOperation(hexString: string): { tezosDelegationOperation: TezosDelegationOperation; rest: string } {
    let { result, rest }: { result: string; rest: string } = this.splitAndReturnRest(hexString, 42)
    const source: string = this.parseTzAddress(result)

    // fee, counter, gas_limit, storage_limit, amount
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const fee: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const counter: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const gasLimit: BigNumber = this.zarithToBigNumber(result)
    ;({ result, rest } = this.splitAndReturnRest(rest, this.findZarithEndIndex(rest)))
    const storageLimit: BigNumber = this.zarithToBigNumber(result)

    let delegate: string | undefined
    if (rest.length === 42) {
      ;({ result, rest } = this.splitAndReturnRest(`01${rest.slice(2)}`, 42))
      delegate = this.parseAddress(result)
    } else if (rest.length > 42) {
      ;({ result, rest } = this.splitAndReturnRest(`00${rest.slice(2)}`, 44))
      delegate = this.parseAddress(result)
    } else if (rest.length === 2 && rest === '00') {
      rest = ''
    }

    return {
      tezosDelegationOperation: {
        source,
        kind: TezosOperationType.DELEGATION,
        fee: fee.toFixed(),
        gas_limit: gasLimit.toFixed(),
        storage_limit: storageLimit.toFixed(),
        counter: counter.toFixed(),
        delegate: delegate ? delegate : undefined
      },
      rest
    }
  }

  public forgeTezosOperation(tezosWrappedOperation: TezosWrappedOperation): string {
    // taken from http://tezos.gitlab.io/mainnet/api/p2p.html
    const cleanedBranch: string = this.checkAndRemovePrefixToHex(tezosWrappedOperation.branch, this.tezosPrefixes.branch) // ignore the tezos prefix
    if (cleanedBranch.length !== 64) {
      // must be 32 bytes
      throw new Error('provided branch is invalid')
    }

    const branchHexString: string = cleanedBranch // ignore the tezos prefix

    const forgedOperation: string[] = tezosWrappedOperation.contents.map((operation: TezosOperation) => {
      switch (operation.kind) {
        case TezosOperationType.TRANSACTION:
          return this.forgeTransactionOperation(operation as TezosSpendOperation)

        case TezosOperationType.REVEAL:
          return this.forgeRevealOperation(operation as TezosRevealOperation)

        case TezosOperationType.ORIGINATION:
          return this.forgeOriginationOperation(operation as TezosOriginationOperation)

        case TezosOperationType.DELEGATION:
          return this.forgeDelegationOperation(operation as TezosDelegationOperation)

        default:
          throw new Error(`Currently unsupported operation type supplied ${operation.kind}`)
      }
    })

    return branchHexString + forgedOperation.join('')
  }

  private forgeSharedFields(operation: TezosOperation): string {
    let resultHexString: string = ''

    let cleanedSource: string = this.checkAndRemovePrefixToHex(operation.source, this.tezosPrefixes.tz1)

    if (cleanedSource.length > 42) {
      // must be less or equal 21 bytes
      throw new Error('provided source is invalid')
    }

    while (cleanedSource.length !== 42) {
      // fill up with 0s to match 21 bytes
      cleanedSource = `0${cleanedSource}`
    }

    resultHexString += cleanedSource
    resultHexString += this.bigNumberToZarith(new BigNumber(operation.fee))
    resultHexString += this.bigNumberToZarith(new BigNumber(operation.counter))
    resultHexString += this.bigNumberToZarith(new BigNumber(operation.gas_limit))
    resultHexString += this.bigNumberToZarith(new BigNumber(operation.storage_limit))

    return resultHexString
  }

  private forgeRevealOperation(operation: TezosRevealOperation): string {
    let resultHexString: string = ''
    resultHexString += '6b' // because this is a reveal operation
    resultHexString += this.forgeSharedFields(operation)

    const cleanedPublicKey: string = this.checkAndRemovePrefixToHex(operation.public_key, this.tezosPrefixes.edpk)

    if (cleanedPublicKey.length === 32) {
      // must be equal 32 bytes
      throw new Error('provided public key is invalid')
    }

    resultHexString += `00${cleanedPublicKey}`

    return resultHexString
  }

  protected forgeTransactionOperation(operation: TezosSpendOperation): string {
    let resultHexString: string = ''
    resultHexString += '6c' // because this is a transaction operation
    resultHexString += this.forgeSharedFields(operation)

    resultHexString += this.bigNumberToZarith(new BigNumber(operation.amount))

    let cleanedDestination: string = operation.destination.toLowerCase().startsWith('kt')
      ? `01${this.checkAndRemovePrefixToHex(operation.destination, this.tezosPrefixes.kt)}00`
      : this.checkAndRemovePrefixToHex(operation.destination, this.tezosPrefixes.tz1)

    if (cleanedDestination.length > 44) {
      // must be less or equal 22 bytes
      throw new Error('provided destination is invalid')
    }

    while (cleanedDestination.length !== 44) {
      // fill up with 0s to match 22bytes
      cleanedDestination = `0${cleanedDestination}`
    }

    resultHexString += cleanedDestination

    if (operation.code) {
      resultHexString += operation.code
    } else {
      resultHexString += '00' // because we have no additional parameters
    }

    return resultHexString
  }

  private forgeOriginationOperation(operation: TezosOriginationOperation): string {
    let resultHexString: string = ''
    resultHexString += '6d' // because this is a reveal operation
    resultHexString += this.forgeSharedFields(operation)

    resultHexString += this.bigNumberToZarith(new BigNumber(operation.balance))

    let cleanedSource: string = this.checkAndRemovePrefixToHex(operation.source, this.tezosPrefixes.tz1)

    if (cleanedSource.length > 42) {
      // must be less or equal 21 bytes
      throw new Error('provided source is invalid')
    }

    while (cleanedSource.length !== 42) {
      // fill up with 0s to match 21 bytes
      cleanedSource = `0${cleanedSource}`
    }

    const delegate: string | undefined = operation.delegate

    if (delegate) {
      let cleanedDestination: string = this.checkAndRemovePrefixToHex(delegate, this.tezosPrefixes.tz1)

      if (cleanedDestination.length > 42) {
        // must be less or equal 21 bytes
        throw new Error('provided source is invalid')
      }

      while (cleanedDestination.length !== 42) {
        // fill up with 0s to match 21 bytes
        cleanedDestination = `0${cleanedDestination}`
      }

      resultHexString += 'ff'
      resultHexString += cleanedDestination
    } else {
      resultHexString += '00'
    }

    // Taken from https://blog.nomadic-labs.com/babylon-update-instructions-for-delegation-wallet-developers.html#transfer-from-a-managertz-smart-contract-to-an-implicit-tz-account

    resultHexString +=
      '000000c602000000c105000764085e036c055f036d0000000325646f046c000000082564656661756c740501035d050202000000950200000012020000000d03210316051f02000000020317072e020000006a0743036a00000313020000001e020000000403190325072c020000000002000000090200000004034f0327020000000b051f02000000020321034c031e03540348020000001e020000000403190325072c020000000002000000090200000004034f0327034f0326034202000000080320053d036d0342'
    resultHexString += '0000001a'
    resultHexString += '0a'
    resultHexString += '00000015'
    resultHexString += cleanedSource

    return resultHexString
  }

  private forgeDelegationOperation(operation: TezosDelegationOperation): string {
    let resultHexString: string = ''
    resultHexString += '6e' // because this is a reveal operation
    resultHexString += this.forgeSharedFields(operation)

    if (operation.delegate) {
      resultHexString += 'ff'

      let cleanedDestination: string | undefined

      if (operation.delegate.toLowerCase().startsWith('tz1')) {
        cleanedDestination = this.checkAndRemovePrefixToHex(operation.delegate, this.tezosPrefixes.tz1)
      } else if (operation.delegate.toLowerCase().startsWith('kt1')) {
        cleanedDestination = this.checkAndRemovePrefixToHex(operation.delegate, this.tezosPrefixes.kt)
      }

      if (!cleanedDestination || cleanedDestination.length > 42) {
        // must be less or equal 21 bytes
        throw new Error('provided destination is invalid')
      }

      while (cleanedDestination.length !== 42) {
        // fill up with 0s to match 21 bytes
        cleanedDestination = `0${cleanedDestination}`
      }

      resultHexString += cleanedDestination
    } else {
      resultHexString += '00'
    }

    return resultHexString
  }

  public bigNumberToZarith(inputNumber: BigNumber): string {
    let bitString: string = inputNumber.toString(2)
    while (bitString.length % 7 !== 0) {
      bitString = `0${bitString}` // fill up with leading '0'
    }

    let resultHexString: string = ''
    // because it's little endian we start from behind...
    for (let i: number = bitString.length; i > 0; i -= 7) {
      let bitStringSection: string = bitString.substring(i - 7, i)

      // tslint:disable-next-line:prefer-conditional-expression
      if (i === 7) {
        // the last byte will show it's the last with a leading '0'
        bitStringSection = `0${bitStringSection}`
      } else {
        // the others will show more will come with a leading '1'
        bitStringSection = `1${bitStringSection}`
      }
      let hexStringSection: string = parseInt(bitStringSection, 2).toString(16)

      if (hexStringSection.length % 2) {
        hexStringSection = `0${hexStringSection}`
      }

      resultHexString += hexStringSection
    }

    return resultHexString
  }

  /**
   * Encodes a signed integer into hex.
   * Copied from conseil.js
   * @param value Number to be encoded.
   */
  public encodeSignedInt(value: number): string {
    if (value === 0) {
      return '00'
    }

    const n = bigInt(value).abs()
    const l = n.bitLength().toJSNumber()

    const arr: number[] = []
    let v = n
    for (let i = 0; i < l; i += 7) {
      let byte = bigInt.zero

      if (i === 0) {
        byte = v.and(0x3f) // first byte makes room for sign flag
        v = v.shiftRight(6)
      } else {
        byte = v.and(0x7f) // NOT base128 encoded
        v = v.shiftRight(7)
      }

      if (value < 0 && i === 0) {
        byte = byte.or(0x40)
      } // set sign flag

      if (i + 7 < l) {
        byte = byte.or(0x80)
      } // set next byte flag
      arr.push(byte.toJSNumber())
    }

    if (l % 7 === 0) {
      arr[arr.length - 1] = arr[arr.length - 1] | 0x80
      arr.push(1)
    }

    return arr.map(v => ('0' + v.toString(16)).slice(-2)).join('')
  }

  public decodeSignedInt(hex: string): number {
    const positive = Buffer.from(hex.slice(0, 2), 'hex')[0] & 0x40 ? false : true
    const arr = Buffer.from(hex, 'hex').map((v, i) => (i === 0 ? v & 0x3f : v & 0x7f))
    let n = bigInt.zero
    for (let i = arr.length - 1; i >= 0; i--) {
      if (i === 0) {
        n = n.or(arr[i])
      } else {
        n = n.or(bigInt(arr[i]).shiftLeft(7 * i - 1))
      }
    }

    return positive ? n.toJSNumber() : n.negate().toJSNumber()
  }

  public findZarithEndIndex(hexString: string): number {
    for (let i: number = 0; i < hexString.length; i += 2) {
      const byteSection: string = hexString.substr(i, 2)
      if (parseInt(byteSection, 16).toString(2).length !== 8) {
        return i + 2
      }
    }
    throw new Error('provided hex string is not Zarith encoded')
  }

  public zarithToBigNumber(hexString: string): BigNumber {
    let bitString: string = ''
    for (let i: number = 0; i < hexString.length; i += 2) {
      const byteSection: string = hexString.substr(i, 2)
      const bitSection: string = `00000000${parseInt(byteSection, 16).toString(2)}`.substr(-7)
      bitString = bitSection + bitString
    }

    return new BigNumber(bitString, 2)
  }

  public async createRevealOperation(counter: BigNumber, publicKey: string, address: string): Promise<TezosRevealOperation> {
    const operation: TezosRevealOperation = {
      kind: TezosOperationType.REVEAL,
      fee: this.revealFee.toFixed(),
      gas_limit: '10000', // taken from conseiljs
      storage_limit: '0', // taken from conseiljs
      counter: counter.toFixed(),
      public_key: bs58check.encode(Buffer.concat([this.tezosPrefixes.edpk, Buffer.from(publicKey, 'hex')])),
      source: address
    }

    return operation
  }

  public async getTezosVotingInfo(blockHash: string): Promise<Array<TezosVotingInfo>> {
    const response: AxiosResponse = await axios.get(`${this.jsonRPCAPI}/chains/main/blocks/${blockHash}/votes/listings`)
    return response.data
  }

  public async fetchCurrentCycle(): Promise<number> {
    const headMetadata = await this.fetchBlockMetadata('head')
    const currentCycle: number = headMetadata.level.cycle
    return currentCycle
  }

  private static FIRST_005_CYCLE: number = 160
  public async calculateRewards(bakerAddress: string, cycle: number): Promise<TezosRewards> {
    const currentCycle: number = await this.fetchCurrentCycle()
    const is005 = cycle >= TezosProtocol.FIRST_005_CYCLE
    let computedBakingRewards = '0'
    let computedEndorsingRewards = '0'
    let fees = '0'
    let totalRewards = '0'
    if (cycle < currentCycle) {
      // baking rewards
      const bakingRights: TezosBakingRight[] = await this.fetchBakingRights(bakerAddress, cycle * TezosProtocol.BLOCKS_PER_CYCLE, cycle)
      const blockLevels = bakingRights.map(br => br.level)
      if (blockLevels.length > 0) {
        const blockBakers = await this.fetchBlockBakers(blockLevels)
        const filteredBakingRights = bakingRights.filter(async bakingRight => {
          const block = blockBakers.find(bb => bb.level === bakingRight.level)
          if (block === undefined) {
            throw new Error("Cannot find block's baker")
          }
          return block.baker === bakerAddress
        })
        computedBakingRewards = (await this.computeBakingRewards(filteredBakingRights, is005, false)).toFixed()
      }

      // endorsing rewards
      const endorsingRights = await this.fetchEndorsingRights(bakerAddress, cycle * TezosProtocol.BLOCKS_PER_CYCLE, cycle)
      const endorsingOperations = await this.fetchEndorsementOperations(cycle, bakerAddress)
      const filteredEndorsingRights = endorsingRights.filter(async endorsingRight => {
        const found = endorsingOperations.find(operation => {
          return operation.delegate === bakerAddress
        })
        return found !== undefined
      })
      computedEndorsingRewards = (await this.computeEndorsingRewards(filteredEndorsingRights, false)).toFixed()

      const frozenBalance = (await this.fetchFrozenBalances((cycle + 1) * TezosProtocol.BLOCKS_PER_CYCLE, bakerAddress)).find(
        fb => fb.cycle == cycle
      )
      if (frozenBalance) {
        fees = frozenBalance.fees
        totalRewards = frozenBalance.rewards
      }
    } else {
      if (cycle - currentCycle > 5) {
        throw new Error('Provided cycle is invalid')
      }
      const bakingRights = await this.fetchBakingRights(bakerAddress, 'head', cycle, 1)
      computedBakingRewards = (await this.computeBakingRewards(bakingRights, is005, true)).toFixed()
      const endorsingRights = await this.fetchEndorsingRights(bakerAddress, 'head', cycle)
      computedEndorsingRewards = (await this.computeEndorsingRewards(endorsingRights, true)).toFixed()
      totalRewards = new BigNumber(computedBakingRewards).plus(new BigNumber(computedEndorsingRewards)).toFixed()
      const frozenBalances = await this.fetchFrozenBalances('head', bakerAddress)
      if (frozenBalances.length > 0) {
        const lastFrozenBalance = frozenBalances[frozenBalances.length - 1]
        fees = lastFrozenBalance.fees
      }
    }

    const snapshotLevel = await this.computeSnapshotBlockLevel(cycle, cycle < currentCycle ? undefined : 'head')
    const bakerInfo = await this.fetchBakerInfo(bakerAddress, snapshotLevel).catch(() => {
      return { staking_balance: '0', delegated_contracts: [] }
    })
    const stakingBalance = new BigNumber(bakerInfo.staking_balance)

    return {
      baker: bakerAddress,
      stakingBalance: stakingBalance.toFixed(),
      bakingRewards: computedBakingRewards,
      endorsingRewards: computedEndorsingRewards,
      cycle: cycle,
      fees: fees,
      totalRewards: totalRewards,
      snapshotBlockLevel: snapshotLevel,
      delegatedContracts: bakerInfo.delegated_contracts
    }
  }

  public async calculatePayouts(
    rewards: TezosRewards,
    offset: number,
    limit: number
  ): Promise<{ delegator: string; share: string; payout: string }[]> {
    const result: { delegator: string; share: string; payout: string }[] = []
    const totalRewardsBN = new BigNumber(rewards.totalRewards).plus(new BigNumber(rewards.fees))
    const limitIndex = offset + limit
    for (let i = offset; i < limitIndex && i < rewards.delegatedContracts.length; i++) {
      const delegator = rewards.delegatedContracts[i]
      let balance = await this.fetchContractBalance(rewards.snapshotBlockLevel, delegator)
      if (balance === undefined) {
        balance = new BigNumber(0)
      }
      const share = balance.div(rewards.stakingBalance)
      const payoutAmount = totalRewardsBN.multipliedBy(share)
      result.push({
        delegator: delegator,
        share: share.toFixed(),
        payout: payoutAmount.toFixed()
      })
    }
    return result
  }

  private async fetchBlockMetadata(block: number | 'head'): Promise<any> {
    const result = await axios.get(`${this.jsonRPCAPI}/chains/main/blocks/${block}/metadata`)
    return result.data
  }

  private async fetchBlockBakers(blockLevels: number[]): Promise<{ level: number; baker: string }[]> {
    const query = {
      fields: ['level', 'baker'],
      predicates: [
        {
          field: 'level',
          operation: 'in',
          set: blockLevels,
          inverse: false
        }
      ]
    }
    const result = await axios.post(`${this.baseApiUrl}/v2/data/tezos/mainnet/blocks`, query, { headers: this.headers })
    return result.data
  }

  private async fetchBlockPriorities(blockLevels: number[]): Promise<{ priority: number; level: number }[]> {
    const query = {
      fields: ['priority', 'level'],
      predicates: [
        {
          field: 'level',
          operation: 'in',
          set: blockLevels,
          inverse: false
        }
      ]
    }
    const result = await axios.post(`${this.baseApiUrl}/v2/data/tezos/mainnet/blocks`, query, { headers: this.headers })
    return result.data
  }

  private async fetchBakingRights(
    bakerAddress: string,
    blockLevel: number | 'head',
    cycle: number,
    maxPriority?: number
  ): Promise<TezosBakingRight[]> {
    const maxPriorityArg = maxPriority !== undefined ? `&max_priority=${maxPriority}` : ''
    const bakingRightsResult = await axios.get(
      `${this.jsonRPCAPI}/chains/main/blocks/${blockLevel}/helpers/baking_rights?cycle=${cycle}&delegate=${bakerAddress}${maxPriorityArg}`
    )
    return bakingRightsResult.data
  }

  private static BAKING_REWARD_PER_BLOCK = 16000000
  private async computeBakingRewards(bakingRights: TezosBakingRight[], is005: boolean, isFutureCycle: boolean): Promise<BigNumber> {
    let result = new BigNumber(0)
    if (is005) {
      const levels = bakingRights.map(br => br.level)
      let endrosementCounts: { level: number; count_kind: string }[] = []
      if (!isFutureCycle) {
        endrosementCounts = await this.fetchEndorsementOperationCount(levels)
      }
      result = bakingRights.reduce((current: BigNumber, next: TezosBakingRight) => {
        // (16 / (priority + 1)) * (0.8 + (0.2 * (e / 32)))
        let count = 32
        if (!isFutureCycle) {
          const endorsementCount = endrosementCounts.find(op => op.level === next.level)
          if (endorsementCount === undefined) {
            throw new Error('Cannot find endorsement operation count')
          }
          count = parseInt(endorsementCount.count_kind)
        }
        const p = next.priority
        const e = count
        const bakingReward = new BigNumber(TezosProtocol.BAKING_REWARD_PER_BLOCK).div(new BigNumber(p + 1)).times(0.8 + 0.2 * (e / 32))

        return current.plus(bakingReward)
      }, new BigNumber(0))
    } else {
      result = new BigNumber(bakingRights.length * TezosProtocol.BAKING_REWARD_PER_BLOCK)
    }
    return result
  }

  private async fetchEndorsingRights(bakerAddress: string, blockLevel: number | 'head', cycle: number): Promise<TezosEndorsingRight[]> {
    const endorsingRightsResult = await axios.get(
      `${this.jsonRPCAPI}/chains/main/blocks/${blockLevel}/helpers/endorsing_rights?cycle=${cycle}&delegate=${bakerAddress}`
    )
    return endorsingRightsResult.data
  }

  private async fetchEndorsementOperations(cycle: number, bakerAddress: string): Promise<{ level: number; delegate: string }[]> {
    const query = {
      fields: ['level', 'delegate'],
      predicates: [
        {
          field: 'kind',
          operation: 'eq',
          set: ['endorsement'],
          inverse: false
        },
        {
          field: 'cycle',
          operation: 'eq',
          set: [`${cycle}`],
          inverse: false
        },
        {
          field: 'delegate',
          operation: 'eq',
          set: [bakerAddress]
        }
      ]
    }
    const result = await axios.post(`${this.baseApiUrl}/v2/data/tezos/mainnet/operations`, query, { headers: this.headers })
    return result.data
  }

  private async fetchEndorsementOperationCount(blockLevels: number[]): Promise<{ count_kind: string; level: number }[]> {
    const query = {
      fields: ['level', 'kind'],
      predicates: [
        {
          field: 'kind',
          operation: 'eq',
          set: ['endorsement'],
          inverse: false
        },
        {
          field: 'level',
          operation: 'eq',
          set: blockLevels,
          inverse: false
        }
      ],
      aggregation: [
        {
          field: 'kind',
          function: 'count'
        }
      ]
    }
    const result = await axios.post(`${this.baseApiUrl}/v2/data/tezos/mainnet/operations`, query, { headers: this.headers })
    return result.data[0].count_level
  }

  private static ENDORSING_REWARD_PER_SLOT = 2000000
  private async computeEndorsingRewards(endorsingRights: TezosEndorsingRight[], isFutureCycle: boolean): Promise<BigNumber> {
    const levels = endorsingRights.map(er => er.level)
    let priorities: { priority: number; level: number }[] = []
    if (!isFutureCycle && levels.length > 0) {
      priorities = await this.fetchBlockPriorities(levels)
    }
    return endorsingRights.reduce((current, next) => {
      let priority = 0
      if (!isFutureCycle) {
        const block = priorities.find(p => p.level === next.level)
        if (block === undefined) {
          throw new Error('Cannot find block priority')
        }
        priority = block.priority
      }
      const multiplier =
        priority === 0
          ? new BigNumber(TezosProtocol.ENDORSING_REWARD_PER_SLOT)
          : new BigNumber(TezosProtocol.ENDORSING_REWARD_PER_SLOT).div(new BigNumber(priority))
      const reward: BigNumber = new BigNumber(next.slots.length).times(multiplier)
      return current.plus(reward)
    }, new BigNumber(0))
  }

  private static BLOCKS_PER_CYCLE = 4096
  private static SNAPSHOTS_PER_CYCLE = 256
  private async fetchBakerInfo(bakerAddress: string, blockLevel: number | 'head'): Promise<TezosBakerInfo> {
    const bakerInfoResult = await axios.get(`${this.jsonRPCAPI}/chains/main/blocks/${blockLevel}/context/delegates/${bakerAddress}`)
    return bakerInfoResult.data
  }

  private async computeSnapshotBlockLevel(cycle: number, blockLevel?: number | 'head'): Promise<number> {
    const level = blockLevel === undefined ? cycle * TezosProtocol.BLOCKS_PER_CYCLE : blockLevel
    const snapshotNumberResult = await axios.get(
      `${this.jsonRPCAPI}/chains/main/blocks/${level}/context/raw/json/rolls/owner/snapshot/${cycle}`,
      { timeout: 60000 }
    )
    const snapshotNumber: number = snapshotNumberResult.data[0]
    const delegationCycle = cycle - 7
    const firstDelegationCycleBlocklLevel = delegationCycle * TezosProtocol.BLOCKS_PER_CYCLE
    const numberOfSnapshotsBeforeDelegationCycle = firstDelegationCycleBlocklLevel / TezosProtocol.SNAPSHOTS_PER_CYCLE
    const totalSnapshotNumber = numberOfSnapshotsBeforeDelegationCycle + snapshotNumber + 1
    const snapshotBlockLevel = totalSnapshotNumber * TezosProtocol.SNAPSHOTS_PER_CYCLE
    return snapshotBlockLevel
  }

  private async fetchFrozenBalances(blockLevel: number | 'head', bakerAddress: string): Promise<TezosFrozenBalance[]> {
    const result = await axios.get(
      `${this.jsonRPCAPI}/chains/main/blocks/${blockLevel}/context/delegates/${bakerAddress}/frozen_balance_by_cycle`
    )
    return result.data
  }

  private async fetchContractBalance(blockLevel: number | `head`, address: string): Promise<BigNumber> {
    const result = await axios.get(`${this.jsonRPCAPI}/chains/main/blocks/${blockLevel}/context/contracts/${address}/balance`)
    return new BigNumber(result.data)
  }
}

interface TezosBakingRight {
  level: number
  delegate: string
  priority: number
}

interface TezosEndorsingRight {
  level: number
  delegate: string
  slots: number[]
}

export interface TezosRewards {
  baker: string
  stakingBalance: string
  bakingRewards: string
  endorsingRewards: string
  fees: string
  totalRewards: string
  cycle: number
  snapshotBlockLevel: number
  delegatedContracts: string[]
}

interface TezosBakerInfo {
  balance: string
  frozen_balance: string
  frozen_balance_by_cycle: TezosFrozenBalance[]
  staking_balance: string
  delegated_contracts: string[]
  delegated_balance: string
  deactivated: boolean
  grace_period: number
}

interface TezosFrozenBalance {
  cycle: number
  deposit: string
  fees: string
  rewards: string
}