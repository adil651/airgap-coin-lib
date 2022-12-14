import { FeeDefaults } from '@airgap/coinlib-core'
import BigNumber from '@airgap/coinlib-core/dependencies/src/bignumber.js-9.0.0/bignumber'
import { ConditionViolationError, NotFoundError } from '@airgap/coinlib-core/errors'
import { Domain } from '@airgap/coinlib-core/errors/coinlib-error'
import { IAirGapTransaction } from '@airgap/coinlib-core/interfaces/IAirGapTransaction'
import { isHex } from '@airgap/coinlib-core/utils/hex'

import { RawTezosTransaction } from '../../types/transaction-tezos'
import { TezosContractCall } from '../contract/TezosContractCall'
import { TezosNetwork } from '../TezosProtocol'
import { TezosUtils } from '../TezosUtils'
import { BigMap } from '../types/contract/BigMap'
import { TezosFA2BalanceOfRequest } from '../types/fa/TezosFA2BalanceOfRequest'
import { TezosFA2BalanceOfResponse } from '../types/fa/TezosFA2BalanceOfResponse'
import { TezosFA2TransferRequest } from '../types/fa/TezosFA2TransferRequest'
import { TezosFA2UpdateOperatorRequest } from '../types/fa/TezosFA2UpdateOperatorRequest'
import { TezosFATokenMetadata } from '../types/fa/TezosFATokenMetadata'
import { MichelineDataNode } from '../types/micheline/MichelineNode'
import { MichelsonList } from '../types/michelson/generics/MichelsonList'
import { MichelsonPair } from '../types/michelson/generics/MichelsonPair'
import { MichelsonAddress } from '../types/michelson/primitives/MichelsonAddress'
import { MichelsonInt } from '../types/michelson/primitives/MichelsonInt'
import { MichelsonString } from '../types/michelson/primitives/MichelsonString'
import { TezosTransactionParameters } from '../types/operations/Transaction'
import { TezosAddressResult } from '../types/TezosAddressResult'
import { TezosOperationType } from '../types/TezosOperationType'
import { isMichelinePrimitive, isMichelinePrimitiveApplication, isMichelineSequence } from '../types/utils'

import { TezosFAProtocol } from './TezosFAProtocol'
import { TezosFA2ProtocolConfig, TezosFA2ProtocolOptions } from './TezosFAProtocolOptions'

enum TezosFA2ContractEntrypoint {
  BALANCE = 'balance_of',
  TRANSFER = 'transfer',
  UPDATE_OPERATORS = 'update_operators'
}

export class TezosFA2Protocol extends TezosFAProtocol {
  public readonly tokenID?: number

  private readonly defaultCallbackContract: Partial<Record<TezosNetwork, Partial<Record<TezosFA2ContractEntrypoint, string>>>>

  constructor(public readonly options: TezosFA2ProtocolOptions) {
    super(options)

    this.tokenID = options.config.defaultTokenID

    this.defaultCallbackContract = {
      [TezosNetwork.MAINNET]: {
        [TezosFA2ContractEntrypoint.BALANCE]: 'KT1LyHDYnML5eCuTEVCTynUpivwG6ns6khiG'
      },
      [TezosNetwork.GHOSTNET]: {
        [TezosFA2ContractEntrypoint.BALANCE]: 'KT1D1vHAyMVqfVJoufp6eYTJcJWEFigR3yjr'
      }
    }
  }

  public async getOptions(): Promise<TezosFA2ProtocolOptions> {
    return this.options
  }

  public async getBalanceOfPublicKey(
    publicKey: string,
    data?: { addressIndex?: number; assetID?: string; [key: string]: any }
  ): Promise<string> {
    const address: TezosAddressResult = await this.getAddressFromPublicKey(publicKey)

    return this.getBalanceOfAddresses([address.address], data)
  }

  public async getAvailableBalanceOfAddresses(addresses: string[], data?: { assetID?: string; [key: string]: any }): Promise<string> {
    return this.getBalanceOfAddresses(addresses, data)
  }

  public async getBalanceOfAddresses(addresses: string[], data?: { assetID?: string; [key: string]: any }): Promise<string> {
    const results: TezosFA2BalanceOfResponse[] = await this.balanceOf(
      addresses.map((address: string) => {
        return {
          address,
          tokenID: data?.assetID ?? this.tokenID ?? 0
        }
      }, this.defaultSourceAddress)
    )

    return results.reduce((sum: BigNumber, next: TezosFA2BalanceOfResponse) => sum.plus(next.amount), new BigNumber(0)).toFixed()
  }

  public async estimateFeeDefaultsFromPublicKey(
    publicKey: string,
    recipients: string[],
    values: string[],
    data?: { addressIndex?: number; tokenID?: number }
  ): Promise<FeeDefaults> {
    // return this.feeDefaults
    if (recipients.length !== values.length) {
      throw new ConditionViolationError(Domain.TEZOS, 'length of recipients and values does not match!')
    }

    const transferCall: TezosContractCall = await this.createTransferCall(publicKey, recipients, values, this.feeDefaults.medium, data)
    const operation = {
      kind: TezosOperationType.TRANSACTION,
      amount: '0',
      destination: this.contractAddress,
      parameters: transferCall.toJSON(),
      fee: '0'
    }

    return this.estimateFeeDefaultsForOperations(publicKey, [operation])
  }

  public async prepareTransactionFromPublicKey(
    publicKey: string,
    recipients: string[],
    values: string[],
    fee: string,
    data?: { addressIndex?: number; assetID?: number }
  ): Promise<RawTezosTransaction> {
    const transferCall: TezosContractCall = await this.createTransferCall(publicKey, recipients, values, fee, data)

    return this.prepareContractCall([transferCall], fee, publicKey)
  }

  public transactionDetailsFromParameters(parameters: TezosTransactionParameters): Partial<IAirGapTransaction>[] {
    const defaultDetails = {
      extra: {
        type: parameters.entrypoint
      }
    }

    if (parameters.entrypoint !== TezosFA2ContractEntrypoint.TRANSFER) {
      console.warn('Only calls to the transfer entrypoint can be converted to IAirGapTransaction')

      return [defaultDetails]
    }

    try {
      const callArgumentsList = MichelsonList.from(parameters.value, (pairJSON: string) =>
        MichelsonPair.from(
          pairJSON,
          undefined,
          (fromJSON: string) => MichelsonAddress.from(fromJSON, 'from_'),
          (txsJSON: string) =>
            MichelsonList.from(
              txsJSON,
              (pairJSON: string) =>
                MichelsonPair.from(
                  pairJSON,
                  undefined,
                  (toJSON: string) => MichelsonAddress.from(toJSON, 'to_'),
                  (pairJSON: string) =>
                    MichelsonPair.from(
                      pairJSON,
                      undefined,
                      (tokenJSON: string) => MichelsonInt.from(tokenJSON, 'token_id'),
                      (amountJSON: string) => MichelsonInt.from(amountJSON, 'amount')
                    )
                ),
              'txs'
            )
        )
      ).asRawValue()

      return Array.isArray(callArgumentsList)
        ? callArgumentsList
            .map((callArguments: unknown) => {
              if (!this.isTransferRequest(callArguments)) {
                return []
              }

              const from: string = isHex(callArguments.from_) ? TezosUtils.parseAddress(callArguments.from_) : callArguments.from_

              const transferDetails: [string, BigNumber, BigNumber][] = callArguments.txs.map((tx) => {
                const to: string = isHex(tx.to_) ? TezosUtils.parseAddress(tx.to_) : tx.to_

                return [to, tx.token_id, tx.amount] as [string, BigNumber, BigNumber]
              })

              return transferDetails
                .map(([to, tokenID, amount]: [string, BigNumber, BigNumber]) => {
                  if (this.tokenID !== undefined && !tokenID.eq(this.tokenID)) {
                    return undefined
                  }

                  return {
                    ...defaultDetails,
                    amount: amount.toFixed(),
                    from: [from],
                    to: [to],
                    extra: {
                      type: parameters.entrypoint,
                      assetID: tokenID.toNumber()
                    }
                  }
                })
                .filter((partialDetails: Partial<IAirGapTransaction> | undefined) => partialDetails !== undefined) as IAirGapTransaction[]
            })
            .reduce((flatten: Partial<IAirGapTransaction>[], next: Partial<IAirGapTransaction>[]) => flatten.concat(next), [])
        : [defaultDetails]
    } catch {
      return [defaultDetails]
    }
  }

  public async balanceOf(
    balanceRequests: TezosFA2BalanceOfRequest[],
    source?: string,
    callbackContract: string = this.callbackContract(TezosFA2ContractEntrypoint.BALANCE)
  ): Promise<TezosFA2BalanceOfResponse[]> {
    const balanceOfCall: TezosContractCall = await this.contract.createContractCall(TezosFA2ContractEntrypoint.BALANCE, {
      requests: balanceRequests.map((request: TezosFA2BalanceOfRequest) => {
        return {
          owner: request.address,
          token_id: typeof request.tokenID === 'string' ? parseInt(request.tokenID, 10) : request.tokenID
        }
      }),
      callback: callbackContract
    })

    const results: MichelineDataNode = await this.runContractCall(balanceOfCall, this.requireSource(source))
    if (isMichelineSequence(results)) {
      return results
        .map((node: MichelineDataNode) => {
          try {
            const pair: MichelsonPair = MichelsonPair.from(
              node,
              undefined,
              (value: unknown) => MichelsonPair.from(value, undefined, MichelsonAddress.from, MichelsonInt.from),
              MichelsonInt.from
            )

            const accountWithTokenID: MichelsonPair = MichelsonPair.from(pair.items[0].get())
            const account: MichelsonAddress = MichelsonAddress.from(accountWithTokenID.items[0].get())
            const tokenID: MichelsonInt = MichelsonInt.from(accountWithTokenID.items[1].get())

            const amount: MichelsonInt = MichelsonInt.from(pair.items[1].get())

            return {
              address: account.address instanceof MichelsonString ? account.address.value : TezosUtils.parseAddress(account.address.value),
              tokenID: tokenID.value.toNumber(),
              amount: amount.value.toFixed()
            }
          } catch (error) {
            console.warn(error)

            return undefined
          }
        })
        .filter((balanceOfResults: TezosFA2BalanceOfResponse | undefined) => balanceOfResults !== undefined) as TezosFA2BalanceOfResponse[]
    } else {
      return []
    }
  }

  public async transfer(transferRequests: TezosFA2TransferRequest[], fee: string, publicKey: string): Promise<RawTezosTransaction> {
    const transferCall: TezosContractCall = await this.contract.createContractCall(
      TezosFA2ContractEntrypoint.TRANSFER,
      transferRequests.map((request: TezosFA2TransferRequest) => {
        return {
          from_: request.from,
          txs: request.txs.map((tx) => {
            return {
              to_: tx.to,
              token_id: tx.tokenID,
              amount: tx.amount
            }
          })
        }
      })
    )

    return this.prepareContractCall([transferCall], fee, publicKey)
  }

  public async updateOperators(
    updateRequests: TezosFA2UpdateOperatorRequest[],
    fee: string,
    publicKey: string
  ): Promise<RawTezosTransaction> {
    const updateCall: TezosContractCall = await this.contract.createContractCall(
      TezosFA2ContractEntrypoint.UPDATE_OPERATORS,
      updateRequests.map((request: TezosFA2UpdateOperatorRequest) => {
        const args = {
          [`${request.operation}_operator`]: {
            owner: request.owner,
            operator: request.operator,
            token_id: request.tokenId
          }
        }

        return [request.operation === 'add' ? 'Left' : 'Right', args]
      })
    )

    return this.prepareContractCall([updateCall], fee, publicKey)
  }

  public async getTokenMetadata(tokenID?: number): Promise<TezosFATokenMetadata | undefined> {
    return this.getTokenMetadataForTokenID(tokenID ?? this.tokenID ?? 0)
  }

  public async fetchTokenHolders(tokenID?: number): Promise<{ address: string; amount: string }[]> {
    return this.contract.network.extras.indexerClient.getTokenBalances({
      contractAddress: this.contract.address,
      id: tokenID ?? this.tokenID ?? 0
    })
  }

  public async getTotalSupply(tokenID?: number): Promise<string> {
    const bigMaps = await this.contract.getBigMaps()
    const bigMapIndex = (this.options.config as TezosFA2ProtocolConfig).totalSupplyBigMapID
    let bigMap: BigMap | undefined = undefined
    if (bigMapIndex !== undefined) {
      bigMap = bigMaps.find((bigMap) => bigMap.id === bigMapIndex)
    } else {
      bigMap = bigMaps.find(
        (bigMap) =>
          (bigMap.path === 'total_supply' || bigMap.path.endsWith('.total_supply')) &&
          isMichelinePrimitiveApplication('nat', bigMap.keyType) &&
          isMichelinePrimitiveApplication('nat', bigMap.valueType)
      )
    }
    const result = await this.contract.getBigMapValue({
      bigMap,
      key: `${tokenID ?? this.tokenID ?? 0}`
    })
    if (result !== undefined && isMichelinePrimitive('int', result.value)) {
      return result.value.int
    }
    return '0'
  }

  private async createTransferCall(
    publicKey: string,
    recipients: string[],
    values: string[],
    fee: string,
    data?: { addressIndex?: number; assetID?: number }
  ): Promise<TezosContractCall> {
    if (recipients.length !== values.length) {
      throw new ConditionViolationError(Domain.TEZOSFA, 'length of recipients and values does not match!')
    }

    const addressIndex: number = data?.addressIndex ?? 0
    const tokenID: number = data?.assetID ?? this.tokenID ?? 0
    const addresses: string[] = (await this.getAddressesFromPublicKey(publicKey)).map((address: TezosAddressResult) => address.address)

    if (!addresses[addressIndex]) {
      throw new NotFoundError(Domain.TEZOSFA, `no kt-address with index ${addressIndex} exists`)
    }

    const fromAddress: string = addresses[addressIndex]
    const recipientsWithValues: [string, string][] = recipients.map((recipient: string, index: number) => [recipient, values[index]])

    const transferCall: TezosContractCall = await this.contract.createContractCall(TezosFA2ContractEntrypoint.TRANSFER, [
      {
        from_: fromAddress,
        txs: recipientsWithValues.map(([recipient, value]: [string, string]) => {
          return {
            to_: recipient,
            token_id: tokenID,
            amount: value
          }
        })
      }
    ])

    return transferCall
  }

  protected callbackContract(entrypoint: TezosFA2ContractEntrypoint): string {
    const networkCallbacks: Partial<Record<TezosFA2ContractEntrypoint, string>> | undefined =
      this.defaultCallbackContract[this.options.network.extras.network]
    const callback: string | undefined = networkCallbacks ? networkCallbacks[entrypoint] : undefined

    return callback ?? ''
  }

  private isTransferRequest(obj: unknown): obj is {
    from_: string
    txs: { to_: string; token_id: BigNumber; amount: BigNumber }[]
  } {
    const anyObj = obj as any

    return (
      anyObj instanceof Object &&
      typeof anyObj.from_ === 'string' &&
      Array.isArray(anyObj.txs) &&
      anyObj.txs.every(
        (tx: any) =>
          tx instanceof Object && typeof tx.to_ === 'string' && BigNumber.isBigNumber(tx.token_id) && BigNumber.isBigNumber(tx.amount)
      )
    )
  }
}
