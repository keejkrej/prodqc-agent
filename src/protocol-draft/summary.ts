import type { OpenQuestionKind, SourcedDraftProtocol, SourcedNumber } from "./schema.ts"
import { emptyReviewCounts, type PitchReviewCounts } from "./review.ts"

export const DIFFERENCE_CATEGORIES = [
  "value",
  "unit",
  "order",
  "missing_step",
  "endpoint_wording"
] as const
export type DifferenceCategory = (typeof DIFFERENCE_CATEGORIES)[number]

export const OPEN_QUESTION_CATEGORIES = [
  "missing_unit",
  "conflicting_values",
  "vague_endpoint",
  "ungrounded_value",
  "missing_value",
  "ambiguous_branch"
] as const

export interface PitchSummary {
  readonly versions: number
  readonly steps_per_version: ReadonlyArray<number>
  readonly differences: {
    readonly value: number
    readonly unit: number
    readonly order: number
    readonly missing_step: number
    readonly endpoint_wording: number
  }
  readonly open_questions: {
    readonly missing_unit: number
    readonly conflicting_values: number
    readonly vague_endpoint: number
    readonly ungrounded_value: number
    readonly missing_value: number
    readonly ambiguous_branch: number
    readonly total: number
  }
  readonly review: PitchReviewCounts
}

export interface SummaryStepView {
  readonly key: string
  readonly ordinal: number
  readonly observation: string | null
  readonly branchFingerprint: string
}

export interface SummaryQuantityView {
  readonly id: string
  readonly value: number | null
  readonly ucum: string | null
}

export interface SummaryDraftView {
  readonly steps: ReadonlyArray<SummaryStepView>
  readonly quantities: ReadonlyArray<SummaryQuantityView>
  readonly openQuestionKinds: ReadonlyArray<OpenQuestionKind>
}

const quantity = (
  id: string,
  sourced: SourcedNumber | undefined
): SummaryQuantityView => ({
  id,
  value: sourced?.value ?? null,
  ucum: sourced?.ucum ?? null
})

export const toSummaryDraftView = (draft: SourcedDraftProtocol): SummaryDraftView => ({
  steps: draft.process_steps.map((step) => ({
    key: step.key,
    ordinal: step.ordinal,
    observation: step.observation_gate?.observation ?? null,
    branchFingerprint: step.branches
      .map((branch) => `${branch.when.value}\0${branch.then.value}`)
      .join("|")
  })),
  quantities: [
    quantity("formulation.n_p_ratio", draft.formulation.n_p_ratio),
    quantity("formulation.total_flow_rate", draft.formulation.total_flow_rate),
    quantity(
      "formulation.flow_rate_ratio_aqueous_to_organic",
      draft.formulation.flow_rate_ratio_aqueous_to_organic
    ),
    ...draft.release_specs.flatMap((spec) =>
      spec.op === "range"
        ? [
            quantity(`spec.${spec.metric}.min`, spec.min),
            quantity(`spec.${spec.metric}.max`, spec.max)
          ]
        : [quantity(`spec.${spec.metric}`, spec.value)]
    )
  ],
  openQuestionKinds: draft.open_questions.map((question) => question.kind)
})

const uniqueOf = <T>(values: ReadonlyArray<T>): number => new Set(values).size

export const countDraftDifferences = (
  views: ReadonlyArray<SummaryDraftView>
): PitchSummary["differences"] => {
  const differences = {
    value: 0,
    unit: 0,
    order: 0,
    missing_step: 0,
    endpoint_wording: 0
  }
  if (views.length === 0) {
    return differences
  }

  const quantityIds = new Set(views.flatMap((view) => view.quantities.map((row) => row.id)))
  for (const id of quantityIds) {
    const rows = views.map(
      (view) => view.quantities.find((row) => row.id === id) ?? { id, value: null, ucum: null }
    )
    if (uniqueOf(rows.map((row) => row.value)) > 1) {
      differences.value += 1
    }
    if (uniqueOf(rows.map((row) => row.ucum)) > 1) {
      differences.unit += 1
    }
  }

  const stepKeys = new Set(views.flatMap((view) => view.steps.map((step) => step.key)))
  for (const key of stepKeys) {
    const present = views.map((view) => view.steps.find((step) => step.key === key))
    if (present.some((step) => step === undefined)) {
      differences.missing_step += 1
      continue
    }
    const steps = present.filter((step): step is SummaryStepView => step !== undefined)
    if (uniqueOf(steps.map((step) => step.ordinal)) > 1) {
      differences.order += 1
    }
    if (
      uniqueOf(steps.map((step) => step.observation ?? "")) > 1 ||
      uniqueOf(steps.map((step) => step.branchFingerprint)) > 1
    ) {
      differences.endpoint_wording += 1
    }
  }

  return differences
}

export const countOpenQuestionCategories = (
  views: ReadonlyArray<SummaryDraftView>
): PitchSummary["open_questions"] => {
  const counts = {
    missing_unit: 0,
    conflicting_values: 0,
    vague_endpoint: 0,
    ungrounded_value: 0,
    missing_value: 0,
    ambiguous_branch: 0,
    total: 0
  }
  for (const view of views) {
    for (const kind of view.openQuestionKinds) {
      counts[kind] += 1
      counts.total += 1
    }
  }
  return counts
}

export const buildPitchSummary = (
  drafts: ReadonlyArray<SourcedDraftProtocol>,
  review: PitchReviewCounts = emptyReviewCounts()
): PitchSummary => {
  const views = drafts.map(toSummaryDraftView)
  return {
    versions: drafts.length,
    steps_per_version: views.map((view) => view.steps.length),
    differences: countDraftDifferences(views),
    open_questions: countOpenQuestionCategories(views),
    review
  }
}

/**
 * Pitch-slide text: integers and fixed category labels only.
 * Must never include protocol text, step content, values, filenames, or names.
 */
export const formatPitchSummary = (summary: PitchSummary): string => {
  const steps = summary.steps_per_version.map(String).join(" ")
  const supplied = summary.review.supplied ? 1 : 0
  return [
    "PITCH SUMMARY",
    "counts only; no protocol text, values, or names",
    `versions ${summary.versions}`,
    `steps_per_version ${steps}`,
    `differences.value ${summary.differences.value}`,
    `differences.unit ${summary.differences.unit}`,
    `differences.order ${summary.differences.order}`,
    `differences.missing_step ${summary.differences.missing_step}`,
    `differences.endpoint_wording ${summary.differences.endpoint_wording}`,
    `open_questions.total ${summary.open_questions.total}`,
    `open_questions.missing_unit ${summary.open_questions.missing_unit}`,
    `open_questions.conflicting_values ${summary.open_questions.conflicting_values}`,
    `open_questions.vague_endpoint ${summary.open_questions.vague_endpoint}`,
    `open_questions.ungrounded_value ${summary.open_questions.ungrounded_value}`,
    `open_questions.missing_value ${summary.open_questions.missing_value}`,
    `open_questions.ambiguous_branch ${summary.open_questions.ambiguous_branch}`,
    `review.supplied ${supplied}`,
    `review.items ${summary.review.items}`,
    `review.corrected ${summary.review.corrected}`,
    `review.accepted ${summary.review.accepted}`,
    `review.deferred ${summary.review.deferred}`,
    ""
  ].join("\n")
}
