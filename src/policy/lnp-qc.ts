import { Context, Effect, Layer } from "effect"
import type { Rfc3339UtcTimestamp, UserId } from "../domain/ids.ts"
import type {
  DownstreamStudyType,
  LnpQcDispositionAction,
  QCMeasurement
} from "../domain/models.ts"
import type { LnpDraftProtocol } from "../protocol/lnp-draft.ts"

export const LNP_FORMULATION_AGENT_VERSION = "0.1.0"
export const LNP_FORMULATION_AGENT_ID = `agent:lnp_formulation:${LNP_FORMULATION_AGENT_VERSION}`

export type LnpMetricStatus = "in_spec" | "borderline_miss" | "hard_fail"
export type LnpBatchClassification = "in_spec" | "borderline" | "hard_fail"

export interface LnpQcEvidence {
  readonly dlsT0ZAvgNm: number
  readonly dlsT0Pdi: number
  readonly ribogreenEePct: number
  readonly dlsT24hZAvgNm: number
}

export interface LnpQcMetricAssessment {
  readonly metric: "pdi" | "ee_pct" | "size_drift_nm" | "z_avg_nm_t0" | "z_avg_nm_t24h"
  readonly value: number
  readonly specMin: number | null
  readonly specMax: number | null
  readonly borderlineMin: number | null
  readonly borderlineMax: number | null
  readonly status: LnpMetricStatus
  readonly simulated: true
}

export interface LnpQcDecision {
  readonly action: LnpQcDispositionAction
  readonly ruleId: string
  readonly ruleApplied: string
  readonly downstreamStudyType: DownstreamStudyType
  readonly classification: LnpBatchClassification
  readonly borderlineBatch: boolean
  readonly thresholds: {
    readonly pdiMax: number
    readonly pdiBorderlineMax: number
    readonly eePctMin: number
    readonly eePctBorderlineMin: number
    readonly sizeDriftNmMax: number
    readonly sizeDriftNmBorderlineMax: number
    readonly zAvgNmMin: number
    readonly zAvgNmMax: number
  }
  readonly evidence: {
    readonly pdi: LnpQcMetricAssessment
    readonly eePct: LnpQcMetricAssessment
    readonly sizeDriftNm: LnpQcMetricAssessment
    readonly zAvgT0: LnpQcMetricAssessment
    readonly zAvgT24h: LnpQcMetricAssessment
  }
  readonly decidedAt: Rfc3339UtcTimestamp
  readonly actor: {
    readonly agentId: string
    readonly agentRole: "lnp_formulation"
    readonly agentVersion: string
    readonly operatorId: UserId
  }
  readonly simulated: true
}

export const extractLnpQcEvidence = (
  measurements: ReadonlyArray<QCMeasurement>
): LnpQcEvidence => {
  const zAvg = measurements
    .filter((row) => row.metric === "z_avg_nm")
    .slice()
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
  const pdi = measurements.find((row) => row.metric === "pdi")
  const ee = measurements.find((row) => row.metric === "ee_pct")
  const t0 = zAvg[0]
  const t24 = zAvg[1]
  if (!t0 || !t24 || !pdi || !ee) {
    throw new Error("SIMULATED LNP QC evidence is incomplete (need t0/t24h DLS, PDI, and EE%).")
  }
  return {
    dlsT0ZAvgNm: t0.value,
    dlsT0Pdi: pdi.value,
    ribogreenEePct: ee.value,
    dlsT24hZAvgNm: t24.value
  }
}

const classifyMax = (
  value: number,
  specMax: number,
  borderlineMax: number
): LnpMetricStatus => {
  if (value <= specMax) {
    return "in_spec"
  }
  if (value <= borderlineMax) {
    return "borderline_miss"
  }
  return "hard_fail"
}

const classifyMin = (
  value: number,
  specMin: number,
  borderlineMin: number
): LnpMetricStatus => {
  if (value >= specMin) {
    return "in_spec"
  }
  if (value >= borderlineMin) {
    return "borderline_miss"
  }
  return "hard_fail"
}

const classifyRange = (value: number, min: number, max: number): LnpMetricStatus =>
  value >= min && value <= max ? "in_spec" : "hard_fail"

const overallClassification = (
  statuses: ReadonlyArray<LnpMetricStatus>
): LnpBatchClassification => {
  if (statuses.includes("hard_fail")) {
    return "hard_fail"
  }
  if (statuses.includes("borderline_miss")) {
    return "borderline"
  }
  return "in_spec"
}

export interface DecideLnpQcInput {
  readonly protocol: LnpDraftProtocol
  readonly downstreamStudyType: DownstreamStudyType
  readonly evidence: LnpQcEvidence
  readonly decidedAt: Rfc3339UtcTimestamp
  readonly operatorId: UserId
}

/**
 * Deterministic LNP QC disposition. No model call.
 * Thresholds and per-use action mapping come from the draft protocol file.
 */
export const decideLnpQc = (input: DecideLnpQcInput): LnpQcDecision => {
  const specs = input.protocol.release_specs
  const bands = specs.borderline_bands
  const [zMin, zMax] = specs.dls_z_avg_nm_range
  const sizeDriftNm = Math.abs(input.evidence.dlsT24hZAvgNm - input.evidence.dlsT0ZAvgNm)

  const pdi: LnpQcMetricAssessment = {
    metric: "pdi",
    value: input.evidence.dlsT0Pdi,
    specMin: null,
    specMax: specs.dls_pdi_max,
    borderlineMin: null,
    borderlineMax: bands.dls_pdi_max,
    status: classifyMax(input.evidence.dlsT0Pdi, specs.dls_pdi_max, bands.dls_pdi_max),
    simulated: true
  }
  const eePct: LnpQcMetricAssessment = {
    metric: "ee_pct",
    value: input.evidence.ribogreenEePct,
    specMin: specs.ribogreen_ee_pct_min,
    specMax: null,
    borderlineMin: bands.ribogreen_ee_pct_min,
    borderlineMax: null,
    status: classifyMin(
      input.evidence.ribogreenEePct,
      specs.ribogreen_ee_pct_min,
      bands.ribogreen_ee_pct_min
    ),
    simulated: true
  }
  const sizeDrift: LnpQcMetricAssessment = {
    metric: "size_drift_nm",
    value: sizeDriftNm,
    specMin: null,
    specMax: specs.size_drift_nm_max,
    borderlineMin: null,
    borderlineMax: bands.size_drift_nm_max,
    status: classifyMax(sizeDriftNm, specs.size_drift_nm_max, bands.size_drift_nm_max),
    simulated: true
  }
  const zAvgT0: LnpQcMetricAssessment = {
    metric: "z_avg_nm_t0",
    value: input.evidence.dlsT0ZAvgNm,
    specMin: zMin,
    specMax: zMax,
    borderlineMin: null,
    borderlineMax: null,
    status: classifyRange(input.evidence.dlsT0ZAvgNm, zMin, zMax),
    simulated: true
  }
  const zAvgT24h: LnpQcMetricAssessment = {
    metric: "z_avg_nm_t24h",
    value: input.evidence.dlsT24hZAvgNm,
    specMin: zMin,
    specMax: zMax,
    borderlineMin: null,
    borderlineMax: null,
    status: classifyRange(input.evidence.dlsT24hZAvgNm, zMin, zMax),
    simulated: true
  }

  const classification = overallClassification([
    pdi.status,
    eePct.status,
    sizeDrift.status,
    zAvgT0.status,
    zAvgT24h.status
  ])
  const mapping =
    input.protocol.decision_points.qc_disposition.rules_by_downstream_use[
      input.downstreamStudyType
    ]
  const action = mapping[classification]
  const ruleId = input.protocol.decision_points.qc_disposition.rule_id

  return {
    action,
    ruleId,
    ruleApplied: `${ruleId}: ${input.downstreamStudyType}.${classification} -> ${action}`,
    downstreamStudyType: input.downstreamStudyType,
    classification,
    borderlineBatch: classification !== "in_spec",
    thresholds: {
      pdiMax: specs.dls_pdi_max,
      pdiBorderlineMax: bands.dls_pdi_max,
      eePctMin: specs.ribogreen_ee_pct_min,
      eePctBorderlineMin: bands.ribogreen_ee_pct_min,
      sizeDriftNmMax: specs.size_drift_nm_max,
      sizeDriftNmBorderlineMax: bands.size_drift_nm_max,
      zAvgNmMin: zMin,
      zAvgNmMax: zMax
    },
    evidence: {
      pdi,
      eePct,
      sizeDriftNm: sizeDrift,
      zAvgT0,
      zAvgT24h
    },
    decidedAt: input.decidedAt,
    actor: {
      agentId: LNP_FORMULATION_AGENT_ID,
      agentRole: "lnp_formulation",
      agentVersion: LNP_FORMULATION_AGENT_VERSION,
      operatorId: input.operatorId
    },
    simulated: true
  }
}

export interface LnpQcPolicyServiceShape {
  readonly decide: (input: DecideLnpQcInput) => Effect.Effect<LnpQcDecision>
}

export class LnpQcPolicyService extends Context.Tag("prodqc-agent/LnpQcPolicyService")<
  LnpQcPolicyService,
  LnpQcPolicyServiceShape
>() {}

export const LnpQcPolicyLive = Layer.succeed(LnpQcPolicyService, {
  decide: (input) => Effect.sync(() => decideLnpQc(input))
})
