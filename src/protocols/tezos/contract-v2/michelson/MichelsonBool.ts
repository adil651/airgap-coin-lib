import { invalidArgumentTypeError } from '../../../../utils/error'
import { MichelineDataNode, MichelinePrimitiveApplication } from '../micheline/MichelineNode'
import { isMichelinePrimitiveApplication } from '../micheline/utils'

import { MichelsonData } from './MichelsonData'
import { MichelsonTypeMapping } from './MichelsonTypeMapping'

export class MichelsonBool extends MichelsonTypeMapping {
  constructor(readonly value: boolean) {
    super()
  }

  public static from(...args: unknown[]): MichelsonBool {
    return isMichelinePrimitiveApplication(args[0])
      ? this.fromMicheline(args[0])
      : this.fromRaw(args[0])
  }

  public static fromMicheline(micheline: MichelinePrimitiveApplication<MichelsonData>): MichelsonBool {
    if (micheline.prim !== 'True' && micheline.prim !== 'False') {
      throw invalidArgumentTypeError('MichelsonBool', 'prim: True | False', `prim: ${micheline.prim}`)
    }
    
    return new MichelsonBool(micheline.prim === 'True')
  }

  public static fromRaw(raw: unknown): MichelsonBool {
    if (typeof raw !== 'boolean') {
      throw invalidArgumentTypeError('MichelsonBool', 'boolean', typeof raw)
    }

    return new MichelsonBool(raw)
  }

  public toMichelineJSON(): MichelineDataNode {
    return {
      prim: this.value ? 'True' : 'False',
    }
  }
}