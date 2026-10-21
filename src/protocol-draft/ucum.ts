/**
 * Map lab-written units onto UCUM codes. Unknown tokens stay unmapped
 * and become open questions rather than invented codes.
 */
const UNIT_TABLE: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(ml|mL)\/min$/i, "mL/min"],
  [/^(ul|uL|µL)\/min$/i, "uL/min"],
  [/^nm$/i, "nm"],
  [/^(%|percent)$/i, "%"],
  [/^(degC|deg C|°C|C)$/i, "Cel"],
  [/^(h|hr|hrs|hour|hours)$/i, "h"],
  [/^(min|mins|minute|minutes)$/i, "min"],
  [/^(mg\/ml|mg\/mL)$/i, "mg/mL"],
  [/^mg$/i, "mg"],
  [/^(1|dimensionless|{pdi}|pdi)$/i, "1"],
  [/^\{n\/p\}$/i, "{N/P}"],
  [/^\{frr\}$/i, "{FRR}"]
]

export const toUcum = (raw: string | undefined | null): string | null => {
  const token = raw?.trim()
  if (!token) {
    return null
  }
  for (const [pattern, ucum] of UNIT_TABLE) {
    if (pattern.test(token)) {
      return ucum
    }
  }
  return null
}

export const NP_RATIO_UCUM = "{N/P}"
export const FRR_UCUM = "1"
