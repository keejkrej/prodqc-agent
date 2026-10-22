import type {
  DyeIncubationLight,
  EeFormula,
  FieldCell,
  RibogreenFieldName,
  RibogreenFields,
  SourceDocument,
  SourcePointer,
  VariantTable
} from "./types.ts"
import { RIBOGREEN_FIELD_NAMES } from "./types.ts"

const VOLUME = /(?:µ|μ|u)L/i
const UG_ML = /(?:µg|ug)\s*\/\s*mL/i

const firstDefined = <T>(...cells: Array<FieldCell<T> | undefined>): FieldCell<T> | undefined => {
  for (const cell of cells) {
    if (cell) return cell
  }
  return undefined
}

const uniqueOrOmit = <T>(hits: readonly FieldCell<T>[]): FieldCell<T> | undefined => {
  const first = hits[0]
  if (!first) return undefined
  return hits.every((hit) => Object.is(hit.value, first.value)) ? first : undefined
}

const pointer = (file: string, line: number): SourcePointer => ({
  file,
  line
})

const cell = <T>(value: T, file: string, line: number): FieldCell<T> => ({
  value,
  source: pointer(file, line)
})

interface IndexedLine {
  readonly file: string
  readonly line: number
  readonly text: string
}

const indexDocuments = (sources: readonly SourceDocument[]): IndexedLine[] => {
  const lines: IndexedLine[] = []
  for (const source of sources) {
    const basename = source.file.replace(/^.*[/\\]/, "")
    for (const [index, text] of source.text.split(/\r?\n/).entries()) {
      lines.push({ file: basename, line: index + 1, text })
    }
  }
  return lines
}

const collect = <T>(
  lines: readonly IndexedLine[],
  match: (text: string) => T | undefined
): FieldCell<T>[] => {
  const hits: FieldCell<T>[] = []
  for (const row of lines) {
    const value = match(row.text)
    if (value !== undefined) hits.push(cell(value, row.file, row.line))
  }
  return hits
}

const asBool = (token: string): boolean | undefined => {
  const t = token.toLowerCase()
  if (t === "yes" || t === "true" || t === "on") return true
  if (t === "no" || t === "false" || t === "off") return false
  return undefined
}

const dyeDilution = (text: string): string | undefined => {
  const match = text.match(/dye\s+dilution[:\s]+(\d+:\d+)/i)
  return match?.[1]
}

const tritonStandardCurve = (text: string): boolean | undefined => {
  const dual =
    /\btwo standard curves\b/i.test(text) ||
    /\bboth\b.{0,40}standard curves/i.test(text) ||
    /\btriton\b.{0,60}\band\b.{0,40}no-?triton/i.test(text) ||
    /\blysed\b.{0,60}\band\b.{0,40}unlysed/i.test(text)
  const only =
    /standard curve only/i.test(text) ||
    /no unlysed standard curve/i.test(text) ||
    /no (?:free|unlysed) standard curve/i.test(text)
  if (dual && !only) return true
  if (only) return false
  return undefined
}

const tritonFinalConc = (text: string): number | undefined => {
  const match =
    text.match(/triton(?:\s+x-?100)?(?:\s+final)?(?:\s+concentration)?[:\s]+(\d+(?:\.\d+)?)\s*%/i) ??
    text.match(/(\d+(?:\.\d+)?)\s*%\s+triton/i)
  return match?.[1] ? Number(match[1]) : undefined
}

const curveVolume = (text: string): number | undefined => {
  const match = text.match(
    new RegExp(`standard[- ]curve wells?(?:\\s+(?:were|are|of))?\\s+(\\d+(?:\\.\\d+)?)\\s*${VOLUME.source}`, "i")
  )
  return match?.[1] ? Number(match[1]) : undefined
}

const sampleVolume = (text: string): number | undefined => {
  const match = text.match(
    new RegExp(`sample wells?(?:\\s+(?:were|are|of))?\\s+(\\d+(?:\\.\\d+)?)\\s*${VOLUME.source}`, "i")
  )
  return match?.[1] ? Number(match[1]) : undefined
}

const perWellVolume = (text: string): number | undefined => {
  const match = text.match(new RegExp(`(?:load\\s+)?(\\d+(?:\\.\\d+)?)\\s*${VOLUME.source}\\s+per well`, "i"))
  return match?.[1] ? Number(match[1]) : undefined
}

const sampleDilution = (text: string): number | undefined => {
  const match =
    text.match(new RegExp(`sample dilution[:\\s]+(\\d+(?:\\.\\d+)?)\\s*${UG_ML.source}`, "i")) ??
    text.match(new RegExp(`diluted to[:\\s]+(\\d+(?:\\.\\d+)?)\\s*${UG_ML.source}`, "i"))
  return match?.[1] ? Number(match[1]) : undefined
}

const inWellRna = (text: string): number | undefined => {
  const match = text.match(new RegExp(`in[- ]well(?:\\s+RNA)?[:\\s]+(\\d+(?:\\.\\d+)?)\\s*${UG_ML.source}`, "i"))
  return match?.[1] ? Number(match[1]) : undefined
}

const lysisTime = (text: string): number | undefined => {
  if (!/\blys(?:e|is|ed)\b/i.test(text)) return undefined
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/i)
  return match?.[1] ? Number(match[1]) : undefined
}

const lysisTemperature = (text: string): number | undefined => {
  if (!/\blys(?:e|is|ed)\b/i.test(text)) return undefined
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:°\s*)?C\b/i)
  return match?.[1] ? Number(match[1]) : undefined
}

const dyeIncubationTime = (text: string): number | undefined => {
  if (!/dye incubat/i.test(text)) return undefined
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/i)
  return match?.[1] ? Number(match[1]) : undefined
}

const dyeIncubationLight = (text: string): DyeIncubationLight | undefined => {
  if (/in the dark|protected from light|light[- ]protected/i.test(text)) return "dark"
  if (/dye incubat/i.test(text) && /in the light|under (?:ambient )?light/i.test(text)) return "light"
  return undefined
}

const tritonBlank = (text: string): boolean | undefined => {
  const labelled = text.match(/triton blank[:\s]+(yes|no|true|false|on|off)/i)
  if (labelled?.[1]) return asBool(labelled[1])
  if (/no triton blank/i.test(text)) return false
  if (/subtract(?:s|ed|ion of)?\s+triton blank/i.test(text)) return true
  return undefined
}

const waterBlank = (text: string): boolean | undefined => {
  const labelled = text.match(/water blank[:\s]+(yes|no|true|false|on|off)/i)
  if (labelled?.[1]) return asBool(labelled[1])
  if (/no water blank/i.test(text)) return false
  if (/subtract(?:s|ed|ion of)?\s+water blank/i.test(text)) return true
  return undefined
}

const eeFormula = (text: string): EeFormula | undefined => {
  const compact = text.replace(/\s+/g, " ").replace(/\u2212/g, "-")
  if (/1\s*-\s*\(?\s*free\s*\/\s*total\s*\)?/i.test(compact)) return "1-(free/total)"
  if (/\(\s*total\s*-\s*free\s*\)\s*\/\s*total/i.test(compact)) return "1-(free/total)"
  if (/total\s*\/\s*free|total over free/i.test(compact)) return "total/free"
  if (/free\s*\/\s*total/i.test(compact)) return "free/total"
  return undefined
}

const excitation = (text: string): number | undefined => {
  const paired = text.match(/\bex(?:citation)?\s*\/\s*em(?:ission)?[:\s]+(\d+)\s*\/\s*(\d+)\s*nm/i)
  if (paired?.[1]) return Number(paired[1])
  const match = text.match(/excit(?:e|ation)[:\s]+(?:at\s+)?(\d+)\s*nm/i)
  return match?.[1] ? Number(match[1]) : undefined
}

const emission = (text: string): number | undefined => {
  const paired = text.match(/\bex(?:citation)?\s*\/\s*em(?:ission)?[:\s]+(\d+)\s*\/\s*(\d+)\s*nm/i)
  if (paired?.[2]) return Number(paired[2])
  const match = text.match(/(?:emission|emitted|emit)[:\s]+(?:at\s+)?(\d+)\s*nm/i)
  return match?.[1] ? Number(match[1]) : undefined
}

const orderFields = (fields: RibogreenFields): RibogreenFields => {
  const ordered: Record<string, FieldCell> = {}
  for (const name of RIBOGREEN_FIELD_NAMES) {
    const value = fields[name]
    if (value !== undefined) ordered[name] = value
  }
  return ordered as RibogreenFields
}

export const extractRibogreen = (params: {
  readonly lab_id: string
  readonly sources: readonly SourceDocument[]
}): VariantTable => {
  const lines = indexDocuments(params.sources)
  const perWell = uniqueOrOmit(collect(lines, perWellVolume))
  const fields: RibogreenFields = {
    dye_dilution: uniqueOrOmit(collect(lines, dyeDilution)),
    triton_standard_curve: uniqueOrOmit(collect(lines, tritonStandardCurve)),
    triton_final_conc_pct: uniqueOrOmit(collect(lines, tritonFinalConc)),
    curve_well_volume_uL: firstDefined(uniqueOrOmit(collect(lines, curveVolume)), perWell),
    sample_well_volume_uL: firstDefined(uniqueOrOmit(collect(lines, sampleVolume)), perWell),
    sample_dilution_ug_per_mL: uniqueOrOmit(collect(lines, sampleDilution)),
    in_well_rna_ug_per_mL: uniqueOrOmit(collect(lines, inWellRna)),
    lysis_time_min: uniqueOrOmit(collect(lines, lysisTime)),
    lysis_temperature_C: uniqueOrOmit(collect(lines, lysisTemperature)),
    dye_incubation_time_min: uniqueOrOmit(collect(lines, dyeIncubationTime)),
    dye_incubation_light: uniqueOrOmit(collect(lines, dyeIncubationLight)),
    triton_blank: uniqueOrOmit(collect(lines, tritonBlank)),
    water_blank: uniqueOrOmit(collect(lines, waterBlank)),
    ee_formula: uniqueOrOmit(collect(lines, eeFormula)),
    excitation_nm: uniqueOrOmit(collect(lines, excitation)),
    emission_nm: uniqueOrOmit(collect(lines, emission))
  }
  return {
    lab_id: params.lab_id,
    assay: "ribogreen-ee",
    fields: orderFields(fields)
  }
}

export const presentFieldNames = (table: VariantTable): RibogreenFieldName[] =>
  RIBOGREEN_FIELD_NAMES.filter((name) => table.fields[name] !== undefined)
