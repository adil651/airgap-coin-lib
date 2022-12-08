import { SCALEEncodeConfig, SCALEType } from './SCALEType'

export abstract class SCALEClass extends SCALEType {
  protected abstract readonly scaleFields: SCALEType[]

  public toString(): string {
    return `[${this.scaleFields.map((field) => field.toString()).join()}]`
  }

  protected _encode(config?: SCALEEncodeConfig): string {
    return this.scaleFields.reduce((encoded: string, current: SCALEType) => encoded + current.encode(config), '')
  }
}
