import type {
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

const incubationTime = (text: string): number | undefined => {
  if (!/incubate|incubation/i.test(text)) return undefined
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:min|minutes?)\b/i)
  return match?.[1] ? Number(match[1]) : undefined
}

const incubationTemperature = (text: string): number | undefined => {
  if (!/incubate|incubation/i.test(text)) return undefined
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:°\s*)?C\b/i)
  return match?.[1] ? Number(match[1]) : undefined
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
    curve_well_volume_uL: firstDefined(uniqueOrOmit(collect(lines, curveVolume)), perWell),
    sample_well_volume_uL: firstDefined(uniqueOrOmit(collect(lines, sampleVolume)), perWell),
    incubation_time_min: uniqueOrOmit(collect(lines, incubationTime)),
    incubation_temperature_C: uniqueOrOmit(collect(lines, incubationTemperature)),
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
