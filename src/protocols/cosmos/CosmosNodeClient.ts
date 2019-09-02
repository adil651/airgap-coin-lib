import axios from 'axios'
import { BigNumber } from 'bignumber.js'
import { IAirGapTransaction } from '../../interfaces/IAirGapTransaction'

export interface NodeInfo {
  protocol_version: {
    p2p: string
    block: string
    app: string
  }
  id: string
  listen_addr: string
  network: string
  version: string
  channels: string
  moniker: string
  other: {
    tx_index: string
    rpc_address: string
  }
}

export abstract class CosmosNodeClient {
  public baseURL: string
  public identifier: string

  constructor(identifier: string, baseURL: string) {
    this.baseURL = baseURL
    this.identifier = identifier
  }

  public abstract async fetchTransactions(address: string, page: number, limit: number): Promise<IAirGapTransaction[]>
  public abstract async fetchBalance(address: string): Promise<BigNumber>
  public abstract async fetchNodeInfo(): Promise<NodeInfo>
}

export class CosmosJSONRPCNodeClient extends CosmosNodeClient {
  constructor(identifier: string, baseURL: string = 'https://lcd-do-not-abuse.cosmostation.io') {
    super(identifier, baseURL)
  }

  public async fetchTransactions(address: string, page: number, limit: number): Promise<IAirGapTransaction[]> {
    const promises: Promise<IAirGapTransaction[]>[] = []
    promises.push(
      new Promise((resolve, reject) => {
        axios
          .get(`${this.baseURL}/txs?message.sender=${address}&page=${page}&limit=${limit}`)
          .then(response => {
            const transactionResponse = response.data
            const airGapTransactions: IAirGapTransaction[] = []
            for (const transaction of transactionResponse) {
            }
            resolve(airGapTransactions)
          })
          .catch(reject)
      })
    )
    promises.push(
      new Promise((resolve, reject) => {
        axios
          .get(`${this.baseURL}/txs?transfer.receiver=${address}&page=${page}&limit=${limit}`)
          .then(response => {
            const transactionResponse = response.data
            const airGapTransactions: IAirGapTransaction[] = []
            for (const transaction of transactionResponse) {
            }
            resolve(airGapTransactions)
          })
          .catch(reject)
      })
    )
    return Promise.all(promises).then(transactions => {
      return transactions.reduce((current, next) => {
        return current.concat(next)
      })
    })
  }

  public async fetchBalance(address: string): Promise<BigNumber> {
    return new Promise((resolve, reject) => {
      axios
        .get(`${this.baseURL}/bank/balances/${address}`)
        .then(response => {
          const data: any[] = response.data
          if (data.length > 0) {
            resolve(new BigNumber(data[0].amount))
          } else {
            resolve(new BigNumber(0))
          }
        })
        .catch(reject)
    })
  }

  public async fetchNodeInfo(): Promise<NodeInfo> {
    return new Promise((resolve, reject) => {
      axios
        .get(`${this.baseURL}/node_info`)
        .then(response => {
          const nodeInfo = response.data as NodeInfo
          resolve(nodeInfo)
        })
        .catch(reject)
    })
  }
}
