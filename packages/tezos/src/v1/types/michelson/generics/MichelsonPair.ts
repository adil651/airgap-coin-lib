import { Lazy } from '@airgap/coinlib-core/data/Lazy'
import { InvalidValueError } from '@airgap/coinlib-core/errors'
import { Domain } from '@airgap/coinlib-core/errors/coinlib-error'
import { invalidArgumentTypeError } from '@airgap/coinlib-core/utils/error'
import { extractGroups } from '@airgap/coinlib-core/utils/string'
import { isRecord } from '@airgap/coinlib-core/utils/type'

import { isAnyMichelinePrimitiveApplication } from '../../../utils/micheline'
import { MichelineDataNode, MichelinePrimitiveApplication } from '../../micheline/MichelineNode'
import { MichelineNodeUtils } from '../../micheline/MichelineNodeUtils'
import { MichelsonGrammarData } from '../grammar/MichelsonGrammarData'
import { MichelsonType } from '../MichelsonType'

const michelsonRegex = /^Pair(?<values>(?:\s.+){2,})$/

export class MichelsonPair extends MichelsonType {
  constructor(public readonly items: Lazy<MichelsonType>[], name?: string) {
    super(name)
  }

  public static from(pair: unknown, name?: string, ...mappingFunctions: unknown[]): MichelsonPair {
    if (pair instanceof MichelsonPair) {
      return pair
    }

    if (isAnyMichelinePrimitiveApplication(pair)) {
      return MichelsonPair.fromMicheline(pair, mappingFunctions, name)
    } else if (typeof pair === 'string' && pair.match(michelsonRegex)) {
      return MichelsonPair.fromMichelson(pair, mappingFunctions, name)
    } else {
      return MichelsonPair.fromUnknown(pair, mappingFunctions, name)
    }
  }

  public static fromMichelson(michelson: string, mappingFunctions: unknown[], name?: string): MichelsonPair {
    const match: RegExpMatchArray | null = michelson.match(michelsonRegex)
    if (match === null) {
      throw new InvalidValueError(Domain.TEZOS, 'MichelsonPair: invalid Michelson value.')
    }

    const values: string[] = extractGroups(match?.groups?.values?.trim() ?? '', {
      groupStart: ['(', '{'],
      groupEnd: [')', '}'],
      groupSeparator: ' '
    })

    return MichelsonPair.fromUnknown(values, mappingFunctions, name)
  }

  public static fromMicheline(
    micheline: MichelinePrimitiveApplication<MichelsonGrammarData>,
    mappingFunctions: unknown[],
    name?: string
  ): MichelsonPair {
    if (micheline.prim !== 'Pair') {
      throw invalidArgumentTypeError('MichelsonPair', 'prim: Pair', `prim: ${micheline.prim}`)
    }

    if (micheline.args === undefined || micheline.args.length < 2) {
      throw invalidArgumentTypeError('MichelsonPair', 'args: <tuple>', 'args: undefined | <array>')
    }

    const normalizedMicheline = MichelineNodeUtils.normalize(micheline)
    if (!isAnyMichelinePrimitiveApplication(normalizedMicheline)) {
      throw new InvalidValueError(Domain.TEZOS, 'MichelsonPair: invalid value after normalization')
    }

    return MichelsonPair.fromUnknown(normalizedMicheline.args, mappingFunctions, name)
  }

  public static fromUnknown(unknownValue: MichelsonType | unknown, mappingFunctions: unknown[], name?: string): MichelsonPair {
    if (!(unknownValue instanceof Object) && (!Array.isArray(unknownValue) || unknownValue.length < 2)) {
      throw invalidArgumentTypeError('MichelsonPair', 'tuple or object', `${typeof unknownValue}: ${unknownValue}`)
    }

    const items: Lazy<MichelsonType>[] = Array.isArray(unknownValue)
      ? unknownValue.map((value, index) => MichelsonPair.asRawValue(value, mappingFunctions[index]))
      : mappingFunctions.map((mappingFunction) => MichelsonPair.asRawValue(unknownValue, mappingFunction))

    return new MichelsonPair(items, name).normalized()
  }

  private static asRawValue(unknownValue: unknown, mappingFactory: unknown): Lazy<MichelsonType> {
    if (!(unknownValue instanceof MichelsonType) && typeof mappingFactory !== 'function') {
      throw new InvalidValueError(Domain.TEZOS, 'MichelsonPair: unknown generic mapping type.')
    }

    return unknownValue instanceof MichelsonType
      ? new Lazy(() => unknownValue)
      : new Lazy(() => {
          const value: unknown = typeof mappingFactory === 'function' ? mappingFactory(unknownValue) : undefined

          if (!(value instanceof MichelsonType)) {
            throw new InvalidValueError(Domain.TEZOS, 'MichelsonPair: unknown generic mapping type.')
          }

          return value
        })
  }

  public asRawValue(): Record<string, any> | [any, any] {
    const values = this.items.map((item) => item.get().asRawValue())
    const value: Record<string, any> | any[] = values.every((value) => isRecord(value))
      ? Object.assign(values.splice(0, 1)[0], ...values)
      : values

    return this.name ? { [this.name]: value } : value
  }

  public toMichelineJSON(): MichelineDataNode {
    return {
      prim: 'Pair',
      args: this.items.map((item) => item.get().toMichelineJSON())
    }
  }

  public eval(): void {
    this.items.forEach((item) => item.get())
  }

  private normalized(): MichelsonPair {
    if (this.items.length === 2) {
      return this
    }
    const newItems = [this.items[0], new Lazy(() => new MichelsonPair(this.items.splice(1)).normalized())]

    return new MichelsonPair(newItems, this.name)
  }
}
