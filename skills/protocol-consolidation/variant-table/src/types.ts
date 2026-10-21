export const RIBOGREEN_FIELD_NAMES = [
  "dye_dilution",
  "triton_standard_curve",
  "curve_well_volume_uL",
  "sample_well_volume_uL",
  "incubation_time_min",
  "incubation_temperature_C",
  "ee_formula",
  "excitation_nm",
  "emission_nm"
] as const

export type RibogreenFieldName = (typeof RIBOGREEN_FIELD_NAMES)[number]

export type EeFormula = "1-(free/total)" | "total/free" | "free/total"

export interface SourcePointer {
  readonly file: string
  readonly line: number
}

export interface FieldCell<T = unknown> {
  readonly value: T
  readonly source: SourcePointer
}

export type RibogreenFields = {
  readonly dye_dilution?: FieldCell<string>
  readonly triton_standard_curve?: FieldCell<boolean>
  readonly curve_well_volume_uL?: FieldCell<number>
  readonly sample_well_volume_uL?: FieldCell<number>
  readonly incubation_time_min?: FieldCell<number>
  readonly incubation_temperature_C?: FieldCell<number>
  readonly ee_formula?: FieldCell<EeFormula>
  readonly excitation_nm?: FieldCell<number>
  readonly emission_nm?: FieldCell<number>
}

export interface VariantTable {
  readonly lab_id: string
  readonly assay: "ribogreen-ee"
  readonly fields: RibogreenFields
}

export type MismatchKind = "value_diff" | "missing_left" | "missing_right"

export interface FieldMismatch {
  readonly field: RibogreenFieldName
  readonly kind: MismatchKind
  readonly left: FieldCell | null
  readonly right: FieldCell | null
}

export interface MismatchReport {
  readonly assay: "ribogreen-ee"
  readonly left: { readonly lab_id: string }
  readonly right: { readonly lab_id: string }
  readonly mismatches: readonly FieldMismatch[]
  readonly matches: readonly RibogreenFieldName[]
}

export interface ProtocolVersionInterval {
  readonly id: string
  readonly page_id: string
  readonly version: number
  readonly valid_from: string
  readonly valid_to: string | null
  readonly source_dir: string
}

export interface MethodsVsWikiReport extends MismatchReport {
  readonly submission_date: string
  readonly selected_protocol_version: {
    readonly id: string
    readonly page_id: string
    readonly version: number
    readonly valid_from: string
    readonly valid_to: string | null
  }
}

export interface SourceDocument {
  readonly file: string
  readonly text: string
}
