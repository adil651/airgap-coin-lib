import { expect } from 'chai'
import 'mocha'

import { IAirGapTransaction } from '@airgap/coinlib-core'
import BigNumber from '@airgap/coinlib-core/dependencies/src/bignumber.js-9.0.0/bignumber'

import { EthereumTestProtocolSpec } from './specs/ethereum'

const ethProtocolSpec = new EthereumTestProtocolSpec()

const txs = [
  {
    amount: new BigNumber('1000000000000000000'),
    fee: new BigNumber('420000000000000'),
    to: ['0x4A1E1D37462a422873BFCCb1e705B05CC4bd922e'],
    from: ['0x4A1E1D37462a422873BFCCb1e705B05CC4bd922e'],
    unsignedTx: {
      nonce: '0x0',
      gasPrice: '0x4a817c800',
      gasLimit: '0x5208',
      to: '0x4A1E1D37462a422873BFCCb1e705B05CC4bd922e',
      value: '100008',
      chainId: 1,
      data: '0x'
    },
    signedTx:
      'f86c808504a817c800825208944a1e1d37462a422873bfccb1e705b05cc4bd922e880de0b6b3a76400008026a00678aaa8f8fd478952bf46044589f5489e809c5ae5717dfe6893490b1f98b441a06a82b82dad7c3232968ec3aa2bba32879b3ecdb877934915d7e65e095fe53d5d'
  },
  {
    amount: new BigNumber('1000000000000000000'),
    fee: new BigNumber('420000000000000'),
    to: ['0x4A1E1D37462a422873BFCCb1e705B05CC4bd922e'],
    from: ['0x4A1E1D37462a422873BFCCb1e705B05CC4bd922e'],
    unsignedTx: {
      nonce: '0x0',
      gasPrice: '0x4a817c800',
      gasLimit: '0x5208',
      to: '0x4A1E1D37462a422873BFCCb1e705B05CC4bd922e',
      value: '0x010',
      chainId: 1,
      data: '0x'
    },
    signedTx:
      'f86c808504a817c800825208944a1e1d37462a422873bfccb1e705b05cc4bd922e880de0b6b3a76400008026a00678aaa8f8fd478952bf46044589f5489e809c5ae5717dfe6893490b1f98b441a06a82b82dad7c3232968ec3aa2bba32879b3ecdb877934915d7e65e095fe53d5d'
  }
]

describe(`Proper error handling`, async () => {
  it('should return the correct error type ', async () => {
    try {
      const privateKey = await ethProtocolSpec.lib.getPrivateKeyFromMnemonic(
        ethProtocolSpec.mnemonic(),
        await ethProtocolSpec.lib.getStandardDerivationPath()
      )
      // const signedTxs: any[] = []

      for (const tx of txs) {
        const signedTx: string = await ethProtocolSpec.lib.signWithPrivateKey(privateKey, tx.unsignedTx)

        const txsFromUnsigned: IAirGapTransaction[] | void = await ethProtocolSpec.lib.getTransactionDetails({
          publicKey: ethProtocolSpec.wallet.publicKey,
          transaction: tx.unsignedTx
        })

        const txsFromSigned: IAirGapTransaction[] = await ethProtocolSpec.lib.getTransactionDetailsFromSigned({
          accountIdentifier: ethProtocolSpec.wallet.publicKey.substr(-6),
          transaction: signedTx
        })

        expect(txsFromUnsigned[0].amount).to.deep.equal(txsFromSigned[0].amount)
      }
    } catch (error) {
      console.error(error)
    }
  })
})
