export const RIBOGREEN_FIELD_NAMES = [
  "dye_dilution",
  "triton_standard_curve",
  "triton_final_conc_pct",
  "curve_well_volume_uL",
  "sample_well_volume_uL",
  "sample_dilution_ug_per_mL",
  "in_well_rna_ug_per_mL",
  "lysis_time_min",
  "lysis_temperature_C",
  "dye_incubation_time_min",
  "dye_incubation_light",
  "triton_blank",
  "water_blank",
  "ee_formula",
  "excitation_nm",
  "emission_nm"
] as const

export type RibogreenFieldName = (typeof RIBOGREEN_FIELD_NAMES)[number]

export type EeFormula = "1-(free/total)" | "total/free" | "free/total"

export type DyeIncubationLight = "dark" | "light"

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
  readonly triton_final_conc_pct?: FieldCell<number>
  readonly curve_well_volume_uL?: FieldCell<number>
  readonly sample_well_volume_uL?: FieldCell<number>
  readonly sample_dilution_ug_per_mL?: FieldCell<number>
  readonly in_well_rna_ug_per_mL?: FieldCell<number>
  readonly lysis_time_min?: FieldCell<number>
  readonly lysis_temperature_C?: FieldCell<number>
  readonly dye_incubation_time_min?: FieldCell<number>
  readonly dye_incubation_light?: FieldCell<DyeIncubationLight>
  readonly triton_blank?: FieldCell<boolean>
  readonly water_blank?: FieldCell<boolean>
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

export type DateBasis = "dataset" | "submission"

export interface MethodsVsWikiReport extends MismatchReport {
  readonly date_basis: DateBasis
  readonly as_of: string
  readonly dataset_dates: readonly string[]
  readonly submission_date?: string
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

export interface LinearRange {
  readonly label?: string
  readonly min: number
  readonly max: number
}

export interface InWellRangeConfig {
  readonly unit: "ug/mL"
  readonly ucum: "ug/mL"
  readonly ranges: Readonly<Record<string, LinearRange>>
}

export interface OntologyEndpoint {
  readonly kind: string
  readonly id: string
}

export interface OntologyEdge {
  readonly type: string
  readonly from: OntologyEndpoint
  readonly to: OntologyEndpoint
  readonly provenance: {
    readonly kind: string
    readonly reason?: string
    readonly who?: string
    readonly when?: string
  }
}

export interface LabOntology {
  readonly entities: {
    readonly datasets: ReadonlyArray<{ readonly id: string; readonly path: string; readonly date: string; readonly owner: string }>
    readonly publications: ReadonlyArray<{
      readonly id: string
      readonly doi: string
      readonly figures: readonly string[]
      readonly submitted?: string
    }>
    readonly protocol_versions: ReadonlyArray<{
      readonly id: string
      readonly page_id: string
      readonly version: number
      readonly valid_from: string
      readonly valid_to: string | null
      readonly assay_type: string
    }>
    readonly instruments?: ReadonlyArray<{ readonly id: string; readonly kind: string }>
    readonly people?: ReadonlyArray<{ readonly id: string; readonly role: string }>
    readonly figures?: ReadonlyArray<{ readonly id: string; readonly label?: string }>
    readonly assay_types?: ReadonlyArray<{ readonly id: string; readonly label?: string; readonly obi_id?: string }>
    readonly reagents?: ReadonlyArray<{
      readonly id: string
      readonly label: string
      readonly chebi_id?: string | null
    }>
    readonly checks?: ReadonlyArray<{ readonly id: string; readonly assay: string }>
  }
  readonly edges: readonly OntologyEdge[]
}
