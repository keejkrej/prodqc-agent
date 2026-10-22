import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { EeFormula, InWellRangeConfig, VariantTable } from "./types.ts"

export type CheckResult = "hit" | "clear" | "unknown"

export interface EeFormulaErrorHit {
  readonly check_id: "ee-formula-error"
  readonly result: CheckResult
  readonly kind?: "inverted" | "leak_fraction"
  readonly message?: string
}

export interface InWellConcHit {
  readonly check_id: "in-well-conc-out-of-range"
  readonly result: CheckResult
  readonly dye_dilution?: string
  readonly in_well_rna_ug_per_mL?: number
  readonly range?: { readonly min: number; readonly max: number }
  readonly message?: string
}

export const EE_FORMULA_MESSAGES = {
  inverted:
    "EE written as total/free inverts free and total and does not report a fraction encapsulated.",
  leak_fraction:
    "EE written as free/total without 1 − reports the leak fraction, mislabelled as encapsulation efficiency."
} as const

export const evaluateEeFormulaError = (formula: EeFormula | undefined): EeFormulaErrorHit => {
  if (formula === undefined) {
    return { check_id: "ee-formula-error", result: "unknown" }
  }
  if (formula === "total/free") {
    return {
      check_id: "ee-formula-error",
      result: "hit",
      kind: "inverted",
      message: EE_FORMULA_MESSAGES.inverted
    }
  }
  if (formula === "free/total") {
    return {
      check_id: "ee-formula-error",
      result: "hit",
      kind: "leak_fraction",
      message: EE_FORMULA_MESSAGES.leak_fraction
    }
  }
  return { check_id: "ee-formula-error", result: "clear" }
}

export const defaultRangeConfigPath = (): string =>
  path.join(fileURLToPath(new URL("../../checks/ribogreen-ee.ranges.json", import.meta.url)))

export const loadRangeConfig = (file = defaultRangeConfigPath()): InWellRangeConfig =>
  JSON.parse(readFileSync(file, "utf8")) as InWellRangeConfig

const inWellConcentration = (table: VariantTable): number | undefined =>
  table.fields.in_well_rna_ug_per_mL?.value ?? table.fields.sample_dilution_ug_per_mL?.value

export const evaluateInWellConcOutOfRange = (
  table: VariantTable,
  ranges: InWellRangeConfig = loadRangeConfig()
): InWellConcHit => {
  const dilution = table.fields.dye_dilution?.value
  const conc = inWellConcentration(table)
  if (dilution === undefined || conc === undefined) {
    return { check_id: "in-well-conc-out-of-range", result: "unknown" }
  }
  const range = ranges.ranges[dilution]
  if (!range) {
    return {
      check_id: "in-well-conc-out-of-range",
      result: "unknown",
      dye_dilution: dilution,
      in_well_rna_ug_per_mL: conc,
      message: `No linear range configured for dye dilution ${dilution}.`
    }
  }
  if (conc < range.min || conc > range.max) {
    return {
      check_id: "in-well-conc-out-of-range",
      result: "hit",
      dye_dilution: dilution,
      in_well_rna_ug_per_mL: conc,
      range: { min: range.min, max: range.max },
      message: `In-well RNA ${conc} ug/mL is outside the ${range.label ?? dilution} linear range ${range.min}–${range.max} ug/mL.`
    }
  }
  return {
    check_id: "in-well-conc-out-of-range",
    result: "clear",
    dye_dilution: dilution,
    in_well_rna_ug_per_mL: conc,
    range: { min: range.min, max: range.max }
  }
}
