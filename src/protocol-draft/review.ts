import { readFile } from "node:fs/promises"

export const REVIEW_OUTCOMES = ["corrected", "accepted", "deferred"] as const
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number]

export interface PitchReviewCounts {
  readonly supplied: boolean
  readonly items: number
  readonly corrected: number
  readonly accepted: number
  readonly deferred: number
}

export const emptyReviewCounts = (): PitchReviewCounts => ({
  supplied: false,
  items: 0,
  corrected: 0,
  accepted: 0,
  deferred: 0
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isReviewOutcome = (value: unknown): value is ReviewOutcome =>
  value === "corrected" || value === "accepted" || value === "deferred"

/**
 * Colleague review file: JSON `{ items: [{ outcome }] }`.
 * Extra keys (notes, protocol text) are ignored and never copied into the pitch summary.
 */
export const parseReviewCounts = (raw: unknown): PitchReviewCounts => {
  if (!isRecord(raw) || !Array.isArray(raw["items"])) {
    throw new Error("Review file must be JSON with an items array of { outcome: corrected|accepted|deferred }.")
  }
  let corrected = 0
  let accepted = 0
  let deferred = 0
  let items = 0
  for (const item of raw["items"]) {
    if (!isRecord(item) || !isReviewOutcome(item["outcome"])) {
      throw new Error("Each review item must have outcome corrected, accepted, or deferred.")
    }
    items += 1
    if (item["outcome"] === "corrected") corrected += 1
    if (item["outcome"] === "accepted") accepted += 1
    if (item["outcome"] === "deferred") deferred += 1
  }
  return { supplied: true, items, corrected, accepted, deferred }
}

export const loadReviewCounts = async (filePath: string): Promise<PitchReviewCounts> => {
  const text = await readFile(filePath, "utf8")
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch (cause) {
    throw new Error(`Review file is not JSON: ${String(cause)}`)
  }
  return parseReviewCounts(parsed)
}
