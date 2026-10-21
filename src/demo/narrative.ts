import type { EventLogEntry } from "../domain/events.ts"
import type { LnpBatchRunResult } from "./lnp-batch.ts"

const LINE = "=".repeat(72)
const THIN = "-".repeat(72)

const studyLabel = (studyType: "screening" | "in_vivo"): string =>
  studyType === "screening" ? "screening (in-vitro / cell experiment)" : "in vivo study"

const actionLabel = (action: LnpBatchRunResult["decision"]["action"]): string => {
  switch (action) {
    case "release_for_cell_experiment":
      return "RELEASE FOR THE CELL EXPERIMENT"
    case "use_with_note":
      return "USE WITH A NOTE"
    case "remake":
      return "REMAKE"
  }
}

const metricLine = (
  name: string,
  value: string,
  spec: string,
  status: string
): string => `  ${name.padEnd(22)} ${value.padEnd(16)} spec ${spec.padEnd(18)} [${status}]`

export const formatBatchNarrative = (
  result: LnpBatchRunResult,
  options: { readonly compact?: boolean } = {}
): string => {
  const { context, decision, signOff, measurements, auditLog } = result
  const sim = context.protocol.simulation
  const identity = [
    `Work order:           ${context.workOrder.workOrderId}`,
    `Downstream use:       ${studyLabel(context.downstreamStudyType)}`,
    `Protocol (DRAFT):     ${context.protocol.protocol_id}  [${context.protocol.schema_version}]`,
    `Rule:                 ${decision.ruleId}`,
    `Operator:             ${decision.actor.operatorId}`,
    `Agent (recommends):   ${decision.actor.agentId}`,
    `Human signer:         ${signOff.signerName}`,
    `Batch / run:          ${context.batch.id} / ${context.run.id}`
  ]
  const header = options.compact
    ? identity
    : [
        LINE,
        "SIMULATED LNP formulation batch — November pitch demo",
        "ALL VALUES SIMULATED — no live instruments, no patient material.",
        "The agent recommends. A named person signs. The policy does not release product.",
        LINE,
        ...identity
      ]

  const instrumentStory = options.compact
    ? []
    : [
        "",
        "[SIMULATED] Microfluidic mixing",
        `  ${SIMULATED_CLOCK("09:00Z")} mix started  FRR aqueous:organic = ${sim.mixer.flow_rate_ratio_aqueous_to_organic}:1, TFR ${sim.mixer.total_flow_rate_ml_min} mL/min, N/P ${context.protocol.formulation.n_p_ratio}`,
        `  ${SIMULATED_CLOCK("09:12Z")} mix complete (SIMULATED mixer adapter)`,
        "",
        "[SIMULATED] DLS t0",
        `  ${SIMULATED_CLOCK("10:00Z")} Z-average ${sim.dls_t0.z_avg_nm} nm, PDI ${sim.dls_t0.pdi}  (lab PDI limit ${decision.thresholds.pdiMax})`,
        "",
        "[SIMULATED] RiboGreen encapsulation",
        `  ${SIMULATED_CLOCK("11:30Z")} EE ${sim.ribogreen.ee_pct}%  (spec ≥ ${decision.thresholds.eePctMin}%)`,
        "",
        "[SIMULATED] DLS t+24h",
        `  ${SIMULATED_CLOCK("10:00Z +1d")} Z-average ${sim.dls_t24h.z_avg_nm} nm  (absolute size vs ${decision.thresholds.zAvgNmMin}–${decision.thresholds.zAvgNmMax} nm)`,
        `  ${SIMULATED_CLOCK("10:00Z +1d")} derived 24 h size drift ${decision.evidence.sizeDriftNm.value} nm  (spec ≤ ${decision.thresholds.sizeDriftNmMax} nm)`,
        "",
        "Evidence vs explicit thresholds (SIMULATED):",
        metricLine(
          "PDI",
          String(decision.evidence.pdi.value),
          `≤ ${decision.thresholds.pdiMax} (borderline ≤ ${decision.thresholds.pdiBorderlineMax})`,
          decision.evidence.pdi.status
        ),
        metricLine(
          "EE%",
          `${decision.evidence.eePct.value}%`,
          `≥ ${decision.thresholds.eePctMin}% (borderline ≥ ${decision.thresholds.eePctBorderlineMin}%)`,
          decision.evidence.eePct.status
        ),
        metricLine(
          "Size drift",
          `${decision.evidence.sizeDriftNm.value} nm`,
          `≤ ${decision.thresholds.sizeDriftNmMax} nm (borderline ≤ ${decision.thresholds.sizeDriftNmBorderlineMax} nm)`,
          decision.evidence.sizeDriftNm.status
        )
      ]

  const signOffLines =
    signOff.outcome === "accepted"
      ? [
          `HUMAN SIGN-OFF:       accepted by ${signOff.signerName} at ${signOff.signedAt}`,
          `FINAL ACTION:         ${actionLabel(signOff.finalAction)}`
        ]
      : [
          `HUMAN SIGN-OFF:       overridden by ${signOff.signerName} at ${signOff.signedAt}`,
          `Override reason:      ${signOff.reason}`,
          `FINAL ACTION:         ${actionLabel(signOff.finalAction)}`
        ]

  const lines: string[] = [
    ...header,
    ...instrumentStory,
    "",
    `Specs:                ${decision.specMissSummary.text}`,
    `Rule applied:         ${decision.ruleApplied}`,
    "",
    `AGENT RECOMMENDATION: ${actionLabel(decision.action)}`,
    ...signOffLines,
    THIN,
    "Append-only audit log (hash-chained). Agent recommends; named human signs.",
    THIN
  ]

  for (const entry of auditLog) {
    lines.push(formatAuditEntry(entry))
  }

  lines.push("")
  lines.push(`QC measurements recorded: ${measurements.length}`)
  lines.push(`Chain head: ${result.chainHead}`)
  lines.push("")
  return lines.join("\n")
}

const SIMULATED_CLOCK = (label: string): string => `[SIMULATED ${label}]`

const formatAuditEntry = (entry: EventLogEntry): string => {
  const payload = entry.payload
  const header = `${entry.occurred_at}  ${entry.payload._tag.padEnd(22)} actor=${entry.actor_id}`
  if (payload._tag === "qc.decided") {
    return [
      header,
      `    recommendation=${payload.action}  downstream=${payload.downstream_study_type}`,
      `    specs=${payload.spec_miss_summary}  borderline_batch=${payload.borderline_batch}`,
      `    rule=${payload.rule_applied}`,
      `    evidence PDI=${payload.pdi} (max ${payload.pdi_max})  EE%=${payload.ee_pct} (min ${payload.ee_pct_min})  drift=${payload.size_drift_nm} nm (max ${payload.size_drift_nm_max})`,
      `    operator=${payload.operator_id}  simulated=${payload.simulated}`,
      `    hash=${entry.hash}`
    ].join("\n")
  }
  if (payload._tag === "qc.signed_off") {
    const reasonLine =
      payload.outcome === "overridden"
        ? `\n    reason=${payload.reason}`
        : ""
    return [
      header,
      `    outcome=${payload.outcome}  signer=${payload.signer_name}`,
      `    recommended=${payload.recommended_action}  final=${payload.final_action}${reasonLine}`,
      `    simulated=${payload.simulated}`,
      `    hash=${entry.hash}`
    ].join("\n")
  }
  return `${header}\n    ${JSON.stringify(payload)}\n    hash=${entry.hash}`
}

export const formatDemoOutput = (batches: {
  readonly screening: LnpBatchRunResult
  readonly inVivo: LnpBatchRunResult
  readonly overrideExample: LnpBatchRunResult
}): string =>
  [
    formatBatchNarrative(batches.screening),
    formatBatchNarrative(batches.inVivo),
    LINE,
    "EXAMPLE (SIMULATED): human override of the in vivo recommendation",
    "The agent still recommended remake. A named person overrode it with a reason.",
    LINE,
    formatBatchNarrative(batches.overrideExample, { compact: true }),
    LINE,
    "The agent recommends; a named person signs. Same SIMULATED measurements.",
    `  screening -> recommended ${batches.screening.decision.action}, ${batches.screening.signOff.outcome} -> ${batches.screening.signOff.finalAction}`,
    `  in_vivo   -> recommended ${batches.inVivo.decision.action}, ${batches.inVivo.signOff.outcome} -> ${batches.inVivo.signOff.finalAction}`,
    `  example   -> recommended ${batches.overrideExample.decision.action}, ${batches.overrideExample.signOff.outcome} -> ${batches.overrideExample.signOff.finalAction}`,
    LINE,
    ""
  ].join("\n")
