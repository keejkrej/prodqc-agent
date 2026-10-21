import type { ProtocolVersionInterval } from "./types.ts"

const inForce = (version: ProtocolVersionInterval, submitted: string): boolean =>
  version.valid_from <= submitted && (version.valid_to === null || submitted < version.valid_to)

export const selectCurrentBefore = (
  versions: readonly ProtocolVersionInterval[],
  submitted: string
): ProtocolVersionInterval => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(submitted)) {
    throw new Error(`select-version: submission date must be YYYY-MM-DD, got ${submitted}`)
  }
  const hits = versions.filter((version) => inForce(version, submitted))
  if (hits.length === 0) {
    throw new Error(`select-version: no protocol version in force on ${submitted}`)
  }
  if (hits.length > 1) {
    throw new Error(
      `select-version: overlapping protocol versions on ${submitted}: ${hits.map((item) => item.id).join(", ")}`
    )
  }
  const selected = hits[0]
  if (!selected) {
    throw new Error(`select-version: no protocol version in force on ${submitted}`)
  }
  return selected
}
