import type { OpenQuestion, SourcedDraftProtocol, SourcedNumber, SourcedParam } from "./schema.ts"

export interface FieldDiff {
  readonly field: string
  readonly step_key: string | null
  readonly values: ReadonlyArray<{
    readonly version: string
    readonly display: string
    readonly source: string | null
  }>
}

export interface ProtocolDraftComparison {
  readonly versions: ReadonlyArray<SourcedDraftProtocol>
  readonly step_diffs: ReadonlyArray<FieldDiff>
  readonly open_questions: ReadonlyArray<OpenQuestion & { readonly version: string }>
}

const numberDisplay = (value: SourcedNumber | SourcedParam | undefined): string | null => {
  if (!value) {
    return null
  }
  const unit = "ucum" in value && value.ucum ? ` ${value.ucum}` : ""
  return `${value.value}${unit}`
}

const sourceDisplay = (value: { readonly source: { readonly file: string; readonly line: number } } | undefined):
  | string
  | null => (value ? `${value.source.file}:${value.source.line}` : null)

const pushIfVaried = (
  diffs: FieldDiff[],
  field: string,
  stepKey: string | null,
  values: FieldDiff["values"]
): void => {
  const unique = new Set(values.map((row) => row.display))
  if (unique.size > 1) {
    diffs.push({ field, step_key: stepKey, values })
  }
}

export const compareDraftedProtocols = (
  drafts: ReadonlyArray<SourcedDraftProtocol>
): ProtocolDraftComparison => {
  const diffs: FieldDiff[] = []

  pushIfVaried(
    diffs,
    "formulation.n_p_ratio",
    null,
    drafts.map((draft) => ({
      version: draft.source_document.file,
      display: numberDisplay(draft.formulation.n_p_ratio) ?? "(not in source)",
      source: sourceDisplay(draft.formulation.n_p_ratio)
    }))
  )
  pushIfVaried(
    diffs,
    "formulation.total_flow_rate",
    null,
    drafts.map((draft) => ({
      version: draft.source_document.file,
      display: numberDisplay(draft.formulation.total_flow_rate) ?? "(not in source)",
      source: sourceDisplay(draft.formulation.total_flow_rate)
    }))
  )
  pushIfVaried(
    diffs,
    "formulation.flow_rate_ratio_aqueous_to_organic",
    null,
    drafts.map((draft) => ({
      version: draft.source_document.file,
      display:
        numberDisplay(draft.formulation.flow_rate_ratio_aqueous_to_organic) ?? "(not in source)",
      source: sourceDisplay(draft.formulation.flow_rate_ratio_aqueous_to_organic)
    }))
  )

  const stepKeys = new Set(drafts.flatMap((draft) => draft.process_steps.map((step) => step.key)))
  for (const key of [...stepKeys].sort()) {
    pushIfVaried(
      diffs,
      "observation_gate",
      key,
      drafts.map((draft) => {
        const step = draft.process_steps.find((item) => item.key === key)
        const gate = step?.observation_gate
        return {
          version: draft.source_document.file,
          display: gate ? `until ${gate.observation}` : "(no observation gate in source)",
          source: gate ? `${gate.source.file}:${gate.source.line}` : null
        }
      })
    )
    pushIfVaried(
      diffs,
      "branches",
      key,
      drafts.map((draft) => {
        const step = draft.process_steps.find((item) => item.key === key)
        const text =
          step && step.branches.length > 0
            ? step.branches.map((branch) => `if ${branch.when.value} -> ${branch.then.value}`).join("; ")
            : "(no branch in source)"
        return {
          version: draft.source_document.file,
          display: text,
          source: step?.branches[0] ? `${step.branches[0].source.file}:${step.branches[0].source.line}` : null
        }
      })
    )
  }

  const specKeys = new Set(drafts.flatMap((draft) => draft.release_specs.map((spec) => spec.metric)))
  for (const metric of [...specKeys].sort()) {
    pushIfVaried(
      diffs,
      `release_specs.${metric}`,
      null,
      drafts.map((draft) => {
        const spec = draft.release_specs.find((item) => item.metric === metric)
        const display = spec
          ? spec.op === "range"
            ? `${spec.min?.value ?? "?"}–${spec.max?.value ?? "?"} ${spec.min?.ucum ?? spec.max?.ucum ?? ""}`.trim()
            : `${spec.op} ${numberDisplay(spec.value) ?? "(not in source)"}`
          : "(not in source)"
        return {
          version: draft.source_document.file,
          display,
          source: spec ? `${spec.source.file}:${spec.source.line}` : null
        }
      })
    )
  }

  const open_questions = drafts.flatMap((draft) =>
    draft.open_questions.map((question) => ({
      ...question,
      version: draft.source_document.file
    }))
  )

  return { versions: drafts, step_diffs: diffs, open_questions }
}
