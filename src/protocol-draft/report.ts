import type { ProtocolDraftComparison } from "./compare.ts"
import type { SourcedDraftProtocol } from "./schema.ts"

const LINE = "=".repeat(72)

const specCell = (draft: SourcedDraftProtocol, metric: string): string => {
  const spec = draft.release_specs.find((item) => item.metric === metric)
  if (!spec) {
    return "—"
  }
  if (spec.op === "range") {
    return `${spec.min?.value ?? "?"}–${spec.max?.value ?? "?"} ${spec.min?.ucum ?? ""}`.trim()
  }
  const unit = spec.value?.ucum ? ` ${spec.value.ucum}` : ""
  return `${spec.op} ${spec.value?.value ?? "?"}${unit}`
}

const formulationCell = (draft: SourcedDraftProtocol, field: "n_p_ratio" | "total_flow_rate"): string => {
  const value = draft.formulation[field]
  if (!value) {
    return "—"
  }
  return `${value.value}${value.ucum ? ` ${value.ucum}` : ""}`
}

const mixGate = (draft: SourcedDraftProtocol): string => {
  const mix = draft.process_steps.find((step) => step.key.includes("mix"))
  if (!mix) {
    return "—"
  }
  const gate = mix.observation_gate ? `until ${mix.observation_gate.observation}` : "no gate"
  const branch =
    mix.branches.length > 0
      ? `; branch: if ${mix.branches[0]?.when.value} -> ${mix.branches[0]?.then.value}`
      : ""
  return `${gate}${branch}`
}

export const formatComparisonReport = (comparison: ProtocolDraftComparison): string => {
  const files = comparison.versions.map((draft) => draft.source_document.file)
  const lines: string[] = [
    "# Protocol draft comparison (lab pilot)",
    "",
    "This is **not** the full migration pipeline. Each version was drafted into the existing `protocols/*.draft.json` schema (`draft: true`, `schema_version: 0.1.0-draft`) with a source pointer on every kept field. The CLI does not invent unread values.",
    "",
    `Model key: \`${comparison.versions[0]?.model ?? "unset"}\``,
    "",
    "Versions:",
    ...files.map((file) => `- \`${file}\``),
    "",
    "## Step-by-step differences",
    ""
  ]

  if (comparison.step_diffs.length === 0) {
    lines.push("No sourced-field differences were found.")
  } else {
    for (const diff of comparison.step_diffs) {
      const heading = diff.step_key ? `### ${diff.step_key} — ${diff.field}` : `### ${diff.field}`
      lines.push(heading, "", "| Version | Value | Source |", "| --- | --- | --- |")
      for (const row of diff.values) {
        lines.push(`| \`${row.version}\` | ${row.display} | ${row.source ?? "—"} |`)
      }
      lines.push("")
    }
  }

  lines.push("## Open questions", "")
  lines.push(
    "Missing units, conflicting values, and vague endpoints stay as questions. They are not filled in.",
    ""
  )
  if (comparison.open_questions.length === 0) {
    lines.push("None.")
  } else {
    lines.push("| Version | Kind | Field | Question | Source |", "| --- | --- | --- | --- | --- |")
    for (const question of comparison.open_questions) {
      const source = question.source ? `${question.source.file}:${question.source.line}` : "—"
      lines.push(
        `| \`${question.version}\` | ${question.kind} | \`${question.field_path}\` | ${question.message} | ${source} |`
      )
    }
  }

  lines.push("", "## One-page comparison for colleague review", "")
  lines.push(
    "Each block is meant to be a single page for one role. Values appear only if they were read from a source line.",
    ""
  )

  lines.push("### Formulating scientist", "")
  lines.push("| Field | " + files.map((file) => `\`${file}\``).join(" | ") + " |")
  lines.push("| --- | " + files.map(() => "---").join(" | ") + " |")
  lines.push(
    "| N/P | " +
      comparison.versions.map((draft) => formulationCell(draft, "n_p_ratio")).join(" | ") +
      " |"
  )
  lines.push(
    "| Total flow rate | " +
      comparison.versions.map((draft) => formulationCell(draft, "total_flow_rate")).join(" | ") +
      " |"
  )
  lines.push(
    "| Mix path | " + comparison.versions.map((draft) => mixGate(draft)).join(" | ") + " |"
  )
  lines.push(
    "| Materials | " +
      comparison.versions
        .map((draft) =>
          draft.materials.length > 0
            ? draft.materials.map((material) => material.name.value).join(", ")
            : "—"
        )
        .join(" | ") +
      " |"
  )
  lines.push("")
  lines.push(
    "Observation-gated mix steps stay as **until clear** (or the wording that was actually written). They are not rewritten as a single fixed mix time.",
    ""
  )

  lines.push("### QC scientist", "")
  lines.push("| Spec | " + files.map((file) => `\`${file}\``).join(" | ") + " |")
  lines.push("| --- | " + files.map(() => "---").join(" | ") + " |")
  for (const metric of ["pdi", "ee_pct", "z_avg_nm", "size_drift_nm"]) {
    lines.push(
      `| ${metric} | ` +
        comparison.versions.map((draft) => specCell(draft, metric)).join(" | ") +
        " |"
    )
  }
  lines.push("")
  lines.push("Units are UCUM (`mL/min`, `nm`, `%`, `Cel`, `h`, `1`, `{N/P}`). A missing unit is an open question, not a guessed code.", "")

  lines.push("### Reviewing colleague / PI", "")
  lines.push("Please decide these before a pilot run. The agent only drafted what it read.", "")
  const reviewQuestions = comparison.open_questions.filter((question) =>
    question.kind === "conflicting_values" ||
    question.kind === "vague_endpoint" ||
    question.kind === "missing_unit"
  )
  if (reviewQuestions.length === 0) {
    lines.push("- No conflicting, vague, or unitless items were flagged.")
  } else {
    for (const question of reviewQuestions) {
      lines.push(`- **${question.kind}** (\`${question.version}\`): ${question.message}`)
    }
  }
  lines.push("")
  lines.push(LINE)
  lines.push("Privacy: never commit real protocol inputs or outputs. Keep them in local `input/` and `output/` (gitignored). Only SYNTHETIC fixtures are committed.")
  lines.push("")
  return lines.join("\n")
}
