import { sr25519DeriveKeypairHard, sr25519DeriveKeypairSoft, sr25519KeypairFromSeed, waitReady } from '@polkadot/wasm-crypto'
import { KeyPair } from '@airgap/coinlib-core/data/KeyPair'
import { InvalidValueError } from '@airgap/coinlib-core/errors'
import { Domain } from '@airgap/coinlib-core/errors/coinlib-error'
import { changeEndianness, stripHexPrefix, toHexStringRaw } from '@airgap/coinlib-core/utils/hex'

interface DeriveJunction {
  chainCode: Uint8Array
  isHard: boolean
}

function assertProperDerivationPath(path: string) {
  if (!(['m', 'm/'] as any).includes(path.slice(0, 2))) {
    throw new InvalidValueError(Domain.UTILS, 'Invalid derivation path')
  }
}

function getChainCode(value: string): Uint8Array {
  const chainCode = new Uint8Array(32)
  const index = parseInt(value, 10)
  const indexHex = changeEndianness(toHexStringRaw(index))

  chainCode.fill(0)
  chainCode.set(Buffer.from(indexHex, 'hex'))

  return chainCode
}

function createDeriveJunction(value: string): DeriveJunction {
  const isHard = (['h', `'`] as any).includes(value.slice(-1))
  const code = isHard ? value.slice(0, -1) : value

  return {
    chainCode: getChainCode(code),
    isHard
  }
}

function deriveFromPath(keyPair: Uint8Array, path: string): Buffer {
  if (path.length == 0) {
    return Buffer.from(keyPair)
  }

  const deriveJunctions = path.split('/').map(createDeriveJunction)
  const derived = deriveJunctions.reduce((pair, junction) => {
    const deriveKeypair = junction.isHard ? sr25519DeriveKeypairHard : sr25519DeriveKeypairSoft

    return deriveKeypair(pair, junction.chainCode)
  }, keyPair)

  return Buffer.from(derived)
}

export async function createSr25519KeyPair(secret: string | Uint8Array, derivationPath: string): Promise<KeyPair> {
  assertProperDerivationPath(derivationPath)
  await waitReady()

  const seed = typeof secret === 'string' ? Buffer.from(stripHexPrefix(secret), 'hex') : secret
  const keyPair = sr25519KeypairFromSeed(seed.subarray(0, 32)) // 32-bit seed is required
  const derivedKeyPair = deriveFromPath(keyPair, derivationPath.slice(2))

  return {
    privateKey: derivedKeyPair.slice(0, 64),
    publicKey: derivedKeyPair.slice(64)
  }
}
