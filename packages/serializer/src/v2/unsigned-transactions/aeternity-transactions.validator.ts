import { RawAeternityTransaction } from '@airgap/aeternity'
import { SignedAeternityTransaction, UnsignedAeternityTransaction } from '@airgap/aeternity'
import { async } from '@airgap/coinlib-core/dependencies/src/validate.js-0.13.1/validate'

import { TransactionValidator } from '../validators/transactions.validator'
import { validateSyncScheme } from '../validators/validators'

const unsignedTransactionConstraints = {
  transaction: {
    presence: { allowEmpty: false },
    type: 'String',
    isValidAeternityTx: true
  },
  networkId: {
    presence: { allowEmpty: false },
    type: 'String',
    isMainNet: true
  }
}
const signedTransactionConstraints = {
  transaction: {
    presence: { allowEmpty: false },
    type: 'String',
    isValidAeternityTx: true
  },
  accountIdentifier: {
    presence: { allowEmpty: false },
    type: 'String'
  }
}
const success = () => undefined
const error = (errors) => errors

export class AeternityTransactionValidator extends TransactionValidator {
  public validateUnsignedTransaction(unsignedTx: UnsignedAeternityTransaction): Promise<any> {
    const rawTx: RawAeternityTransaction = unsignedTx.transaction
    validateSyncScheme({})

    return async(rawTx, unsignedTransactionConstraints).then(success, error)
  }
  public async validateSignedTransaction(signedTx: SignedAeternityTransaction): Promise<any> {
    return async(signedTx, signedTransactionConstraints).then(success, error)
  }
}
