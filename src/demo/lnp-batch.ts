import { Effect, Layer } from "effect"
import { makeLnpFormulationAgentLayer } from "../agents/lnp-formulation.ts"
import { LnpFormulationAgent } from "../agents/contracts.ts"
import { makeInMemoryEventLogLayer } from "../audit/in-memory-event-log.ts"
import type { AppendEventInput, EventLogEntry, EventLogServiceShape } from "../domain/events.ts"
import { EventLogService } from "../domain/events.ts"
import type { IsoCalendarDate, Rfc3339UtcTimestamp } from "../domain/ids.ts"
import type {
  DownstreamStudyType,
  InstrumentEvent,
  QCMeasurement
} from "../domain/models.ts"
import {
  DlsInstrumentService,
  MicrofluidicMixerService,
  RibogreenPlateReaderService
} from "../instruments/contracts.ts"
import { makeSimulatedInstrumentLayers } from "../instruments/simulated.ts"
import {
  deriveDlsSizeDriftMeasurement,
  extractLnpQcEvidence,
  LNP_FORMULATION_AGENT_ID,
  LnpQcPolicyLive,
  LnpQcPolicyService,
  type LnpQcDecision
} from "../policy/lnp-qc.ts"
import type { LnpDraftProtocol } from "../protocol/lnp-draft.ts"
import { stripProseForAgent } from "../security/capabilities.ts"
import { validateParameterBindingsAgainstProtocol } from "../services/self-improvement.ts"
import { makeSimulatedBatchContext, SIMULATED_TIMELINE, type SimulatedBatchContext } from "./scenario.ts"

const ts = (value: string): Rfc3339UtcTimestamp => value as Rfc3339UtcTimestamp

export interface LnpBatchRunResult {
  readonly simulated: true
  readonly disclaimer: "ALL VALUES SIMULATED"
  readonly context: SimulatedBatchContext
  readonly instrumentEvents: ReadonlyArray<InstrumentEvent>
  readonly measurements: ReadonlyArray<QCMeasurement>
  readonly decision: LnpQcDecision
  readonly auditLog: ReadonlyArray<EventLogEntry>
  readonly chainHead: string
}

const appendAgentEvent = (
  log: EventLogServiceShape,
  input: Omit<AppendEventInput, "actor_type" | "actor_id">
) =>
  log.append({
    ...input,
    actor_type: "agent",
    actor_id: LNP_FORMULATION_AGENT_ID
  })

export const runOneSimulatedLnpBatch = (
  protocol: LnpDraftProtocol,
  downstreamStudyType: DownstreamStudyType
): Effect.Effect<
  LnpBatchRunResult,
  unknown,
  | EventLogService
  | LnpFormulationAgent
  | LnpQcPolicyService
  | MicrofluidicMixerService
  | DlsInstrumentService
  | RibogreenPlateReaderService
> =>
  Effect.gen(function* () {
    const lnpAgent = yield* LnpFormulationAgent
    const mixer = yield* MicrofluidicMixerService
    const dls = yield* DlsInstrumentService
    const ribogreen = yield* RibogreenPlateReaderService
    const policy = yield* LnpQcPolicyService
    const log = yield* EventLogService
    const context = makeSimulatedBatchContext(protocol, downstreamStudyType)

    yield* lnpAgent.planFormulationRun({
      request: stripProseForAgent(context.request),
      payloadConstruct: stripProseForAgent(context.construct),
      lipidInventory: context.lipidInventory,
      eligibleProtocols: [stripProseForAgent(context.protocolVersion)]
    })

    yield* appendAgentEvent(log, {
      request_id: context.request.id,
      entity_type: "request",
      entity_id: context.request.id,
      visibility: "lab_only",
      payload: { _tag: "request.submitted", state: "submitted" },
      occurred_at: ts(SIMULATED_TIMELINE.submittedAt)
    })
    yield* appendAgentEvent(log, {
      request_id: context.request.id,
      entity_type: "request",
      entity_id: context.request.id,
      visibility: "lab_only",
      payload: {
        _tag: "request.scheduled",
        batch_id: context.batch.id,
        committed_delivery_date: "2026-11-10" as IsoCalendarDate
      },
      occurred_at: ts(SIMULATED_TIMELINE.submittedAt)
    })
    yield* appendAgentEvent(log, {
      request_id: context.request.id,
      entity_type: "run",
      entity_id: context.run.id,
      visibility: "lab_only",
      payload: {
        _tag: "run.started",
        protocol_version_id: context.protocolVersion.id,
        arm: "default"
      },
      occurred_at: ts(SIMULATED_TIMELINE.mixStart)
    })

    yield* appendAgentEvent(log, {
      request_id: context.request.id,
      entity_type: "step",
      entity_id: context.mixStep.id,
      visibility: "lab_only",
      payload: {
        _tag: "step.started",
        step_id: context.mixStep.id,
        protocol_step_key: "microfluidic_mix",
        planned_params: context.workOrder.plannedParams
      },
      occurred_at: ts(SIMULATED_TIMELINE.mixStart)
    })

    const mix = yield* mixer.mix({
      workOrder: context.workOrder,
      stepId: context.mixStep.id,
      eventId: context.ids.mixEventId,
      occurredAt: ts(SIMULATED_TIMELINE.mixEnd),
      recordedAt: ts(SIMULATED_TIMELINE.mixEnd)
    })
    yield* validateParameterBindingsAgainstProtocol(
      context.protocolVersion,
      "microfluidic_mix",
      {
        total_flow_rate_ml_min: mix.actualParams.total_flow_rate_ml_min ?? 0,
        flow_rate_ratio_aqueous_to_organic:
          mix.actualParams.flow_rate_ratio_aqueous_to_organic ?? 0
      }
    )
    yield* appendAgentEvent(log, {
      request_id: context.request.id,
      entity_type: "step",
      entity_id: context.mixStep.id,
      visibility: "lab_only",
      payload: {
        _tag: "step.completed",
        step_id: context.mixStep.id,
        protocol_step_key: "microfluidic_mix",
        actual_params: mix.actualParams
      },
      occurred_at: ts(SIMULATED_TIMELINE.mixEnd)
    })

    const dlsT0 = yield* dls.scanSize({
      workOrder: context.workOrder,
      runId: context.run.id,
      stepId: context.dlsT0Step.id,
      timepoint: "t0",
      eventId: context.ids.dlsT0EventId,
      zAverageMeasurementId: context.ids.zAvgT0MeasurementId,
      pdiMeasurementId: context.ids.pdiMeasurementId,
      occurredAt: ts(SIMULATED_TIMELINE.dlsT0),
      recordedAt: ts(SIMULATED_TIMELINE.dlsT0),
      releaseSpec: context.releaseSpec
    })

    const ribo = yield* ribogreen.measureEncapsulationEfficiency({
      workOrder: context.workOrder,
      runId: context.run.id,
      stepId: context.ribogreenStep.id,
      eventId: context.ids.ribogreenEventId,
      measurementId: context.ids.eeMeasurementId,
      occurredAt: ts(SIMULATED_TIMELINE.ribogreen),
      recordedAt: ts(SIMULATED_TIMELINE.ribogreen),
      releaseSpec: context.releaseSpec
    })

    const dlsT24h = yield* dls.scanSize({
      workOrder: context.workOrder,
      runId: context.run.id,
      stepId: context.dlsT24hStep.id,
      timepoint: "t24h",
      eventId: context.ids.dlsT24hEventId,
      zAverageMeasurementId: context.ids.zAvgT24hMeasurementId,
      pdiMeasurementId: null,
      occurredAt: ts(SIMULATED_TIMELINE.dlsT24h),
      recordedAt: ts(SIMULATED_TIMELINE.dlsT24h),
      releaseSpec: context.releaseSpec
    })

    const sizeDrift = deriveDlsSizeDriftMeasurement({
      measurementId: context.ids.sizeDriftMeasurementId,
      t0ZAvg: dlsT0.zAverage,
      t24hZAvg: dlsT24h.zAverage,
      specMax: protocol.release_specs.size_drift_nm_max
    })

    const measurements: QCMeasurement[] = [
      dlsT0.zAverage,
      ...(dlsT0.pdi ? [dlsT0.pdi] : []),
      ribo.encapsulationEfficiency,
      dlsT24h.zAverage,
      sizeDrift
    ]

    for (const measurement of measurements) {
      yield* appendAgentEvent(log, {
        request_id: context.request.id,
        entity_type: "qc",
        entity_id: measurement.id,
        visibility: "lab_only",
        payload: {
          _tag: "qc.measured",
          measurement_id: measurement.id,
          verdict: measurement.verdict
        },
        occurred_at: measurement.measured_at
      })
    }

    const decision = yield* policy.decide({
      protocol,
      downstreamStudyType,
      evidence: extractLnpQcEvidence(measurements),
      decidedAt: ts(SIMULATED_TIMELINE.decidedAt),
      operatorId: context.ids.operatorId
    })

    yield* appendAgentEvent(log, {
      request_id: context.request.id,
      entity_type: "qc",
      entity_id: context.run.id,
      visibility: "lab_only",
      payload: {
        _tag: "qc.decided",
        action: decision.action,
        rule_id: decision.ruleId,
        rule_applied: decision.ruleApplied,
        downstream_study_type: decision.downstreamStudyType,
        classification: decision.classification,
        borderline_batch: decision.borderlineBatch,
        specs_evaluated: decision.specMissSummary.specsEvaluated,
        specs_missed: decision.specMissSummary.specsMissed,
        all_misses_within_borderline_band:
          decision.specMissSummary.allMissesWithinBorderlineBand,
        spec_miss_summary: decision.specMissSummary.text,
        pdi: decision.evidence.pdi.value,
        pdi_max: decision.thresholds.pdiMax,
        pdi_borderline_max: decision.thresholds.pdiBorderlineMax,
        ee_pct: decision.evidence.eePct.value,
        ee_pct_min: decision.thresholds.eePctMin,
        ee_pct_borderline_min: decision.thresholds.eePctBorderlineMin,
        size_drift_nm: decision.evidence.sizeDriftNm.value,
        size_drift_nm_max: decision.thresholds.sizeDriftNmMax,
        size_drift_nm_borderline_max: decision.thresholds.sizeDriftNmBorderlineMax,
        operator_id: decision.actor.operatorId,
        agent_id: decision.actor.agentId,
        simulated: true
      },
      occurred_at: decision.decidedAt
    })

    const runOutcome =
      decision.action === "remake"
        ? "failed"
        : decision.action === "use_with_note"
          ? "partial"
          : "success"

    yield* appendAgentEvent(log, {
      request_id: context.request.id,
      entity_type: "run",
      entity_id: context.run.id,
      visibility: "lab_only",
      payload: {
        _tag: "run.completed",
        outcome: runOutcome,
        yield_mg: 0.25,
        purity_pct: null
      },
      occurred_at: ts(SIMULATED_TIMELINE.decidedAt)
    })

    const timeline = yield* log.getRequestTimeline({
      requestId: context.request.id,
      granularity: "full",
      maxVisibility: "internal"
    })

    return {
      simulated: true,
      disclaimer: "ALL VALUES SIMULATED",
      context,
      instrumentEvents: [
        mix.instrumentEvent,
        dlsT0.instrumentEvent,
        ribo.instrumentEvent,
        dlsT24h.instrumentEvent
      ],
      measurements,
      decision,
      auditLog: timeline.events,
      chainHead: timeline.chain_head
    }
  })

export const makeLnpDemoLayer = (protocol: LnpDraftProtocol) =>
  Layer.mergeAll(
    makeSimulatedInstrumentLayers(protocol),
    makeInMemoryEventLogLayer(),
    makeLnpFormulationAgentLayer(protocol),
    LnpQcPolicyLive
  )

export const runDemoBatches = (protocol: LnpDraftProtocol) =>
  Effect.gen(function* () {
    const screening = yield* runOneSimulatedLnpBatch(protocol, "screening")
    const inVivo = yield* runOneSimulatedLnpBatch(protocol, "in_vivo")
    return { screening, inVivo }
  }).pipe(Effect.provide(makeLnpDemoLayer(protocol)))
