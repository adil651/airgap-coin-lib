import BigNumber from '@airgap/coinlib-core/dependencies/src/bignumber.js-9.0.0/bignumber'
import {
  isArray,
  isDate,
  isInteger,
  isNumber,
  isObject,
  isString,
  validate,
  validators
} from '@airgap/coinlib-core/dependencies/src/validate.js-0.13.1/validate'

validators.type = (value, options, key, attributes) => {
  // allow empty values by default (needs to be checked by "presence" check)
  if (value === null || typeof value === 'undefined') {
    return null
  }

  // allow defining object of any type using their constructor. --> options = {clazz: ClassName}
  /*
  if (typeof options === 'object' && options.clazz) {
    return value instanceof options.clazz ? null : 'is not of type "' + options.clazz.name + '"'
  }
  */
  if (!validators.type.checks[options]) {
    throw new Error(`Could not find validator for type ${options}`)
  }

  return validators.type.checks[options](value) ? null : `is not of type "${options}"`
}

validators.type.checks = {
  Object(value: unknown) {
    return isObject(value) && !isArray(value)
  },
  Array: isArray,
  Integer: isInteger,
  Number: isNumber,
  String: isString,
  Date: isDate,
  Boolean(value: unknown) {
    return typeof value === 'boolean'
  },
  BigNumber(value: unknown) {
    return BigNumber.isBigNumber(value)
  }
}

validators.isHexStringWithPrefix = (value: unknown) => {
  if (typeof value !== 'string') {
    return 'is not hex string'
  }
  if (!value.startsWith('0x')) {
    return 'is not hex string'
  }

  const hexWithoutPrefix = value.substr(2)
  if (hexWithoutPrefix.length === 0) {
    // For ethereum, "0x" is valid
    return null
  }

  return /[0-9A-F]/gi.test(hexWithoutPrefix) ? null : 'is not hex string'
}

validators.isPublicKey = (value: unknown) => {
  if (typeof value !== 'string') {
    return 'is not a valid public key: should be of type string'
  }
  if (value.length !== 64) {
    return 'is not a valid public key: wrong length'
  }

  return /[0-9A-F]/gi.test(value) ? null : 'is not a valid public key: invalid characters'
}

export async function validateSyncScheme(syncScheme: unknown) {
  const constraints = {
    version: {
      presence: { allowEmpty: false },
      numericality: { noStrings: true, onlyInteger: true, greaterThanOrEqualTo: 0 }
    },
    type: {
      presence: { allowEmpty: false },
      numericality: { noStrings: true, onlyInteger: true, greaterThanOrEqualTo: 0 }
    },
    protocol: {
      presence: { allowEmpty: false },
      type: 'String',
      length: {
        minimum: 1
      }
    },
    payload: {
      presence: { allowEmpty: false },
      type: 'Array'
    }
  }

  return validate(syncScheme, constraints)
}

// tslint:disable-next-line
/*
function validateSerializationInput(from: string, fee: BigNumber, amount: BigNumber, publicKey: string, transaction: any) {
  const constraints = {
    from: {
      presence: { allowEmpty: false },
      type: 'String'
    },
    fee: {
      presence: { allowEmpty: false },
      type: 'BigNumber'
    },
    amount: {
      presence: { allowEmpty: false },
      type: 'BigNumber'
    },
    publicKey: {
      presence: { allowEmpty: false },
      type: 'String'
    },
    transaction: {
      presence: { allowEmpty: false },
      type: 'Array'
    }
  }

  let test = validate(
    {
      from,
      fee,
      amount,
      publicKey,
      transaction
    },
    constraints
  )

  return test
}
*/
