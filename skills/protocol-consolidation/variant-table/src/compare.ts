import { RIBOGREEN_FIELD_NAMES } from "./types.ts"
import type { FieldMismatch, MismatchReport, VariantTable } from "./types.ts"

export const compareTables = (left: VariantTable, right: VariantTable): MismatchReport => {
  if (left.assay !== right.assay) {
    throw new Error(`compare: assay mismatch (${left.assay} vs ${right.assay})`)
  }
  const mismatches: FieldMismatch[] = []
  const matches: Array<(typeof RIBOGREEN_FIELD_NAMES)[number]> = []
  for (const field of RIBOGREEN_FIELD_NAMES) {
    const leftCell = left.fields[field]
    const rightCell = right.fields[field]
    if (!leftCell && !rightCell) continue
    if (!leftCell) {
      mismatches.push({ field, kind: "missing_left", left: null, right: rightCell ?? null })
      continue
    }
    if (!rightCell) {
      mismatches.push({ field, kind: "missing_right", left: leftCell, right: null })
      continue
    }
    if (Object.is(leftCell.value, rightCell.value)) {
      matches.push(field)
    } else {
      mismatches.push({ field, kind: "value_diff", left: leftCell, right: rightCell })
    }
  }
  return {
    assay: "ribogreen-ee",
    left: { lab_id: left.lab_id },
    right: { lab_id: right.lab_id },
    mismatches,
    matches
  }
}
