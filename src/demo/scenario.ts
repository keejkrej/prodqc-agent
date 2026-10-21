import { Schema } from "effect"
import type { WorkOrder } from "../agents/contracts.ts"
import type { LabId, Rfc3339UtcTimestamp } from "../domain/ids.ts"
import {
  Batch,
  Construct,
  Design,
  Request,
  Run,
  Step,
  type DownstreamStudyType
} from "../domain/models.ts"
import {
  toLipidInventory,
  toProtocolVersion,
  toReleaseSpec,
  type LnpDraftProtocol
} from "../protocol/lnp-draft.ts"
import {
  SIMULATED_DLS_INSTRUMENT_ID,
  SIMULATED_MIXER_INSTRUMENT_ID,
  SIMULATED_RIBOGREEN_INSTRUMENT_ID
} from "../instruments/simulated.ts"
import { makeDemoEntityIds, type DemoEntityIds, type DemoLane } from "./ids.ts"

export const SIMULATED_LAB_ID = "lab_sim_pitch_nov2026" as LabId

export const SIMULATED_TIMELINE = {
  submittedAt: "2026-11-03T08:30:00Z",
  mixStart: "2026-11-03T09:00:00Z",
  mixEnd: "2026-11-03T09:12:00Z",
  dlsT0: "2026-11-03T10:00:00Z",
  ribogreen: "2026-11-03T11:30:00Z",
  dlsT24h: "2026-11-04T10:00:00Z",
  decidedAt: "2026-11-04T10:15:00Z",
  signedAt: "2026-11-04T10:20:00Z"
} as const as Record<
  | "submittedAt"
  | "mixStart"
  | "mixEnd"
  | "dlsT0"
  | "ribogreen"
  | "dlsT24h"
  | "decidedAt"
  | "signedAt",
  Rfc3339UtcTimestamp
>

export const laneForStudyType = (studyType: DownstreamStudyType): DemoLane =>
  studyType === "screening" ? "SCRN" : "NVVX"

export interface SimulatedBatchContext {
  readonly simulated: true
  readonly disclaimer: "ALL VALUES SIMULATED"
  readonly downstreamStudyType: DownstreamStudyType
  readonly ids: DemoEntityIds
  readonly request: Request
  readonly design: Design
  readonly construct: Construct
  readonly batch: Batch
  readonly run: Run
  readonly workOrder: WorkOrder
  readonly mixStep: Step
  readonly dlsT0Step: Step
  readonly ribogreenStep: Step
  readonly dlsT24hStep: Step
  readonly protocol: LnpDraftProtocol
  readonly protocolVersion: ReturnType<typeof toProtocolVersion>
  readonly releaseSpec: ReturnType<typeof toReleaseSpec>
  readonly lipidInventory: ReturnType<typeof toLipidInventory>
}

const decodeRequest = Schema.decodeUnknownSync(Request)
const decodeDesign = Schema.decodeUnknownSync(Design)
const decodeConstruct = Schema.decodeUnknownSync(Construct)
const decodeBatch = Schema.decodeUnknownSync(Batch)
const decodeRun = Schema.decodeUnknownSync(Run)
const decodeStep = Schema.decodeUnknownSync(Step)

export const makeSimulatedBatchContext = (
  protocol: LnpDraftProtocol,
  downstreamStudyType: DownstreamStudyType
): SimulatedBatchContext => {
  const ids = makeDemoEntityIds(laneForStudyType(downstreamStudyType))
  const protocolVersion = toProtocolVersion(protocol, SIMULATED_TIMELINE.submittedAt)
  const releaseSpec = toReleaseSpec(protocol, ids.releaseSpecId)
  const plannedParams = {
    simulated: true,
    downstream_study_type: downstreamStudyType,
    n_p_ratio: protocol.formulation.n_p_ratio,
    total_flow_rate_ml_min: protocol.formulation.total_flow_rate_ml_min,
    flow_rate_ratio_aqueous_to_organic:
      protocol.formulation.flow_rate_ratio_aqueous_to_organic
  }

  const request = decodeRequest({
    id: ids.requestId,
    lab_id: SIMULATED_LAB_ID,
    submitted_by: ids.operatorId,
    product_line: "lnp_formulation",
    service_level: "standard",
    designs: [ids.designId],
    requested_amount_mg: 0.25,
    requested_format: "lnp_suspension",
    release_spec_id: ids.releaseSpecId,
    state: "scheduled",
    biosafety_screen: {
      verdict: "clear",
      database_version: "sim-watchlist-0",
      screened_at: SIMULATED_TIMELINE.submittedAt,
      matched_watchlist_ids: [],
      flagged_motifs: [],
      reviewed_by: null
    },
    committed_delivery_date: "2026-11-10",
    visibility: "lab_private",
    created_at: SIMULATED_TIMELINE.submittedAt,
    notes: "SIMULATED November pitch work order. Downstream use is structured on the WorkOrder, not in this prose field."
  })

  const design = decodeDesign({
    id: ids.designId,
    request_id: ids.requestId,
    molecule_type: "lnp_formulation_design",
    sequence: "SIMULATED_MRNA_PAYLOAD",
    sequence_hash:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    annotations: [],
    target_description_structured: {
      target_id: "sim_lnp_payload",
      modality: "payload"
    },
    constraints: {
      no_tags: true,
      required_tags: [],
      glyco_required: false
    }
  })

  const construct = decodeConstruct({
    id: ids.constructId,
    design_id: ids.designId,
    expression_host: "microfluidic_mixer",
    vector: "not_applicable",
    tag_scheme: [],
    codon_optimized_for: "none",
    dna_source: "not_applicable",
    predicted_mw_da: 1_000_000,
    predicted_pi: null,
    feasibility: {
      score: 0.72,
      risk_flags: ["high_pdi_risk", "low_encapsulation_risk"]
    },
    status: "approved"
  })

  const batch = decodeBatch({
    id: ids.batchId,
    batch_type: "lnp_formulation",
    expression_host: "microfluidic_mixer",
    scheduled_start: SIMULATED_TIMELINE.mixStart,
    capacity_slots: 4,
    reserved_rework_slots: 1,
    assigned_runs: [ids.runId],
    operator_id: ids.operatorId,
    state: "active"
  })

  const run = decodeRun({
    id: ids.runId,
    construct_id: ids.constructId,
    batch_id: ids.batchId,
    protocol_version_id: protocolVersion.id,
    parameter_bindings: plannedParams,
    assignment_arm: "default",
    outcome: "pending",
    yield_mg: null,
    purity_pct: null,
    cost_units: 1,
    started_at: SIMULATED_TIMELINE.mixStart,
    ended_at: null
  })

  const step = (
    id: Step["id"],
    key: string,
    ordinal: number,
    instrumentId: string
  ): Step =>
    decodeStep({
      id,
      run_id: ids.runId,
      protocol_step_key: key,
      ordinal,
      planned_params: { ...plannedParams, target_instrument_id: instrumentId },
      actual_params: null,
      expected_duration_minutes:
        protocol.process_steps.find((item) => item.key === key)
          ?.expected_duration_minutes ?? 5,
      operator_id: ids.operatorId,
      state: "pending",
      started_at: null,
      ended_at: null
    })

  const mixStep = step(ids.mixStepId, "microfluidic_mix", 1, SIMULATED_MIXER_INSTRUMENT_ID)
  const workOrder: WorkOrder = {
    workOrderId: ids.workOrderId,
    batchId: ids.batchId,
    runId: ids.runId,
    stepId: ids.mixStepId,
    protocolStepKey: "microfluidic_mix",
    targetInstrumentId: SIMULATED_MIXER_INSTRUMENT_ID,
    plannedParams,
    downstreamStudyType
  }

  return {
    simulated: true,
    disclaimer: "ALL VALUES SIMULATED",
    downstreamStudyType,
    ids,
    request,
    design,
    construct,
    batch,
    run,
    workOrder,
    mixStep,
    dlsT0Step: step(ids.dlsT0StepId, "dls_t0", 2, SIMULATED_DLS_INSTRUMENT_ID),
    ribogreenStep: step(ids.ribogreenStepId, "ribogreen_ee", 3, SIMULATED_RIBOGREEN_INSTRUMENT_ID),
    dlsT24hStep: step(ids.dlsT24hStepId, "dls_t24h", 4, SIMULATED_DLS_INSTRUMENT_ID),
    protocol,
    protocolVersion,
    releaseSpec,
    lipidInventory: toLipidInventory(protocol)
  }
}
