import { UnsignedTransaction } from '@airgap/coinlib-core'
import BigNumber from '@airgap/coinlib-core/dependencies/src/bignumber.js-9.0.0/bignumber'
// @ts-ignore
import * as ethUtil from '@airgap/coinlib-core/dependencies/src/ethereumjs-util-5.2.0'
import { BalanceError, ConditionViolationError } from '@airgap/coinlib-core/errors'
import { Domain } from '@airgap/coinlib-core/errors/coinlib-error'
import { IAirGapSignedTransaction } from '@airgap/coinlib-core/interfaces/IAirGapSignedTransaction'
import { IAirGapTransaction } from '@airgap/coinlib-core/interfaces/IAirGapTransaction'
import { FeeDefaults } from '@airgap/coinlib-core/protocols/ICoinProtocol'
import { ICoinSubProtocol, SubProtocolType } from '@airgap/coinlib-core/protocols/ICoinSubProtocol'

import { SignedEthereumTransaction } from '../../types/signed-transaction-ethereum'
import { RawEthereumTransaction } from '../../types/transaction-ethereum'
import { UnsignedEthereumTransaction } from '../../types/unsigned-transaction-ethereum'
import { BaseEthereumProtocol } from '../BaseEthereumProtocol'
import { EtherscanInfoClient } from '../clients/info-clients/EtherscanInfoClient'
import { AirGapNodeClient, EthereumRPCDataTransfer } from '../clients/node-clients/AirGapNodeClient'
import { EthereumERC20ProtocolOptions } from '../EthereumProtocolOptions'
import { EthereumAddressResult, EthereumTransactionCursor, EthereumTransactionResult } from '../EthereumTypes'
import { EthereumUtils } from '../utils/utils'

const EthereumTransaction = require('@airgap/coinlib-core/dependencies/src/ethereumjs-tx-1.3.7/index')

export class GenericERC20 extends BaseEthereumProtocol<AirGapNodeClient, EtherscanInfoClient> implements ICoinSubProtocol {
  public isSubProtocol: boolean = true
  public subProtocolType: SubProtocolType = SubProtocolType.TOKEN
  public readonly contractAddress: string

  constructor(public readonly options: EthereumERC20ProtocolOptions) {
    super(options)

    this.contractAddress = options.config.contractAddress

    this.symbol = options.config.symbol
    this.name = options.config.name
    this.marketSymbol = options.config.marketSymbol
    this.identifier = options.config.identifier
    this.decimals = options.config.decimals
  }

  public async getIsSubProtocol(): Promise<boolean> {
    return this.isSubProtocol
  }

  public async getSubProtocolType(): Promise<SubProtocolType> {
    return this.subProtocolType
  }

  public async getContractAddress(): Promise<string> {
    return this.contractAddress
  }

  public async getBalanceOfPublicKey(publicKey: string): Promise<string> {
    const address: EthereumAddressResult = await this.getAddressFromPublicKey(publicKey)

    return this.getBalanceOfAddresses([address.address])
  }

  public async getBalanceOfAddresses(addresses: string[]): Promise<string> {
    const balances: BigNumber[] = await Promise.all(
      addresses.map((address: string) => {
        return this.options.nodeClient.callBalanceOf(this.contractAddress, address)
      })
    )

    return balances.reduce((a: BigNumber, b: BigNumber) => a.plus(b)).toString(10)
  }

  public signWithPrivateKey(privateKey: string, transaction: RawEthereumTransaction): Promise<IAirGapSignedTransaction> {
    if (!transaction.data || transaction.data === '0x') {
      transaction.data = new EthereumRPCDataTransfer(transaction.to, transaction.value).abiEncoded() // backwards-compatible fix
    }

    return super.signWithPrivateKey(privateKey, transaction)
  }

  private async estimateGas(source: string, recipient: string, hexValue: string): Promise<BigNumber> {
    const result = await this.options.nodeClient.estimateTransferGas(this.contractAddress, source, recipient, hexValue)

    return result
  }

  public async estimateMaxTransactionValueFromPublicKey(publicKey: string, recipients: string[], fee?: string): Promise<string> {
    return this.getBalanceOfPublicKey(publicKey)
  }

  public async estimateFeeDefaultsFromPublicKey(
    publicKey: string,
    recipients: string[],
    values: string[],
    data?: any
  ): Promise<FeeDefaults> {
    if (recipients.length !== values.length) {
      return Promise.reject('recipients length does not match with values')
    }
    if (recipients.length !== 1) {
      return Promise.reject('you cannot have 0 recipients')
    }
    const address: string = (await this.getAddressFromPublicKey(publicKey)).address
    const estimatedGas = await this.estimateGas(address, recipients[0], EthereumUtils.toHex(values[0]))
    const gasPrise = await this.options.nodeClient.getGasPrice()
    const feeStepFactor = new BigNumber(0.5)
    const estimatedFee = estimatedGas.times(gasPrise)
    const lowFee = estimatedFee.minus(estimatedFee.times(feeStepFactor).integerValue(BigNumber.ROUND_FLOOR))
    const mediumFee = estimatedFee
    const highFee = mediumFee.plus(mediumFee.times(feeStepFactor).integerValue(BigNumber.ROUND_FLOOR))

    return {
      low: lowFee.shiftedBy(-this.feeDecimals).toFixed(),
      medium: mediumFee.shiftedBy(-this.feeDecimals).toFixed(),
      high: highFee.shiftedBy(-this.feeDecimals).toFixed()
    }
  }

  public async prepareTransactionFromPublicKey(
    publicKey: string,
    recipients: string[],
    values: string[],
    fee: string
  ): Promise<RawEthereumTransaction> {
    const wrappedValues: BigNumber[] = values.map((value: string) => new BigNumber(value))
    const wrappedFee: BigNumber = new BigNumber(fee)

    if (recipients.length !== wrappedValues.length) {
      throw new ConditionViolationError(Domain.ERC20, 'recipients length does not match with values')
    }

    if (recipients.length !== 1) {
      throw new ConditionViolationError(Domain.ERC20, 'you cannot have 0 recipients')
    }

    const balance: BigNumber = new BigNumber(await this.getBalanceOfPublicKey(publicKey))

    if (balance.isGreaterThanOrEqualTo(wrappedValues[0])) {
      const address: string = await this.getAddressFromPublicKey(publicKey).then((address: EthereumAddressResult) => address.address)
      const ethBalance: BigNumber = new BigNumber(await super.getBalanceOfAddresses([address]))

      const estimatedGas = await this.estimateGas(address, recipients[0], EthereumUtils.toHex(wrappedValues[0].toFixed()))

      if (ethBalance.isGreaterThanOrEqualTo(wrappedFee)) {
        const txCount: number = await this.options.nodeClient.fetchTransactionCount(address)
        const gasPrice: BigNumber = wrappedFee.isEqualTo(0)
          ? new BigNumber(0)
          : wrappedFee.div(estimatedGas).integerValue(BigNumber.ROUND_CEIL)
        const transaction: RawEthereumTransaction = {
          nonce: EthereumUtils.toHex(txCount),
          gasLimit: EthereumUtils.toHex(estimatedGas.toFixed()),
          gasPrice: EthereumUtils.toHex(gasPrice.toFixed()),
          to: this.contractAddress,
          value: EthereumUtils.toHex(new BigNumber(0).toFixed()),
          chainId: this.options.network.extras.chainID,
          data: new EthereumRPCDataTransfer(recipients[0], EthereumUtils.toHex(wrappedValues[0].toFixed())).abiEncoded()
        }

        return transaction
      } else {
        throw new BalanceError(Domain.ERC20, 'not enough ETH balance')
      }
    } else {
      throw new BalanceError(Domain.ERC20, 'not enough token balance')
    }
  }

  public getTransactionsFromAddresses(
    addresses: string[],
    limit: number,
    cursor?: EthereumTransactionCursor
  ): Promise<EthereumTransactionResult> {
    return new Promise((overallResolve, overallReject) => {
      const promises: Promise<EthereumTransactionResult>[] = []
      for (const address of addresses) {
        promises.push(this.options.infoClient.fetchContractTransactions(this, this.contractAddress, address, limit, cursor))
      }

      Promise.all(promises)
        .then((values) => {
          const page = Math.max(...values.map((txResult) => txResult.cursor.page))
          overallResolve(
            values.reduce((a, b) => {
              return { transactions: a.transactions.concat(b.transactions), cursor: { page } }
            })
          )
        })
        .catch(overallReject)
    })
  }

  public async getTransactionDetailsFromSigned(signedTx: SignedEthereumTransaction): Promise<IAirGapTransaction[]> {
    const ethTxs: IAirGapTransaction[] = await super.getTransactionDetailsFromSigned(signedTx)

    if (ethTxs.length !== 1) {
      throw new ConditionViolationError(Domain.ERC20, 'More than one ETH transaction detected.')
    }

    const ethTx: IAirGapTransaction = ethTxs[0]

    const extractedTx = new EthereumTransaction(signedTx.transaction)
    const tokenTransferDetails = new EthereumRPCDataTransfer(`0x${extractedTx.data.toString('hex')}`)
    ethTx.to = [ethUtil.toChecksumAddress(tokenTransferDetails.recipient)]
    ethTx.amount = new BigNumber(tokenTransferDetails.amount).toString(10)

    return [ethTx]
  }

  public async getTransactionDetails(unsignedTx: UnsignedTransaction): Promise<IAirGapTransaction[]> {
    const unsignedEthereumTx = unsignedTx as UnsignedEthereumTransaction
    const ethTxs: IAirGapTransaction[] = await super.getTransactionDetails(unsignedEthereumTx)

    if (ethTxs.length !== 1) {
      throw new ConditionViolationError(Domain.ERC20, 'More than one ETH transaction detected.')
    }

    const ethTx: IAirGapTransaction = ethTxs[0]

    const tokenTransferDetails = new EthereumRPCDataTransfer(unsignedEthereumTx.transaction.data)

    ethTx.to = [ethUtil.toChecksumAddress(tokenTransferDetails.recipient)]
    ethTx.amount = new BigNumber(tokenTransferDetails.amount).toString(10)

    return [ethTx]
  }
}
