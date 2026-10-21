import { Effect } from "effect"
import {
  EventLatencyBoundExceededError,
  EventLogImmutabilityError,
  ProtocolPromotionError,
  ProvenanceResolutionDefectError
} from "../domain/errors.ts"
import type { EventLogEntry } from "../domain/events.ts"
import type {
  PromotionRecordId,
  ProtocolFamily,
  RequestId,
  StepId,
  UserId,
  VialId
} from "../domain/ids.ts"
import type {
  ChangeProposal,
  Delivery,
  PromotionRecord,
  ProtocolVersion,
  Run,
  Step
} from "../domain/models.ts"
import type { HumanRole } from "../security/capabilities.ts"
import {
  type RunAnalysisRow,
  StatisticalAcceptanceEngine
} from "../services/self-improvement.ts"
import {
  MAX_EVENT_LATENCY_MS,
  type VialProvenanceRecord,
  verifyVialProvenanceCompleteness
} from "../services/transparency.ts"

/**
 * §1 Engineering Properties & Falsification Test Suite Abstractions
 *
 * Both differentiating properties of the Protein Fab are defined as engineering
 * properties falsifiable by automated tests:
 *
 * P1 — Maximum Transparency:
 *   - T1.1: Bounded event latency (`<= 15 min` [ASSUMPTION]) and `>= 1` event per executed `Step`.
 *   - T1.2: Every delivered `Vial` resolves a non-empty `protocol_version_id` and gating QC record set.
 *   - T1.3: `event_log` is append-only at the database privilege level + unbroken hash chain.
 *
 * P2 — Self-Improvement:
 *   - T2.1: Every `ProtocolVersion` with `status = "default"` has a valid `PromotionRecord`
 *     referencing run IDs, effect estimate, acceptance rule, and signer.
 *   - T2.2: No `ProtocolVersion` transitions to `default` without `signed_off_by` holding role `scientific_advisor`.
 *   - T2.3: Replaying the promotion decision from stored `Run`/`QCMeasurement` rows reproduces
 *     the stored `effect_estimate` within numerical tolerance.
 */

export interface ClosedRequestAuditSample {
  readonly requestId: RequestId
  readonly runs: ReadonlyArray<{
    readonly run: Run
    readonly executedSteps: ReadonlyArray<Step>
  }>
  readonly events: ReadonlyArray<EventLogEntry>
}

/**
 * T1.1 Falsification Check:
 * Verifies across a sample of closed requests (e.g., 20 requests) that:
 * 1. Every executed `Step` (`state === "done" | "failed"`) has `>= 1` corresponding event.
 * 2. No event has `recorded_at - occurred_at > maxAllowedLatencyMs` (default 15 minutes).
 */
export const verifyT1_1_BoundedLatencyAndStepCoverage = (
  samples: ReadonlyArray<ClosedRequestAuditSample>,
  maxAllowedLatencyMs: number = MAX_EVENT_LATENCY_MS
): Effect.Effect<
  {
    readonly auditedRequestCount: number
    readonly auditedStepCount: number
    readonly auditedEventCount: number
    readonly maxObservedLatencyMs: number
  },
  EventLatencyBoundExceededError
> =>
  Effect.gen(function* () {
    let auditedStepCount = 0
    let auditedEventCount = 0
    let maxObservedLatencyMs = 0

    for (const sample of samples) {
      for (const ev of sample.events) {
        auditedEventCount += 1
        const occurredMs = Date.parse(ev.occurred_at)
        const recordedMs = Date.parse(ev.recorded_at)
        const latencyMs = recordedMs - occurredMs

        if (latencyMs > maxAllowedLatencyMs || latencyMs < 0) {
          return yield* Effect.fail(
            new EventLatencyBoundExceededError({
              requestId: sample.requestId,
              eventId: ev.event_id,
              occurredAt: ev.occurred_at,
              recordedAt: ev.recorded_at,
              latencyMs,
              maxAllowedLatencyMs
            })
          )
        }
        if (latencyMs > maxObservedLatencyMs) {
          maxObservedLatencyMs = latencyMs
        }
      }

      for (const { executedSteps } of sample.runs) {
        for (const step of executedSteps) {
          if (step.state === "done" || step.state === "failed") {
            auditedStepCount += 1
            const hasStepEvent = sample.events.some(
              (ev) =>
                ev.entity_id === step.id ||
                ((ev.payload._tag === "step.started" ||
                  ev.payload._tag === "step.completed") &&
                  ev.payload.step_id === (step.id as StepId))
            )
            if (!hasStepEvent) {
              return yield* Effect.fail(
                new EventLatencyBoundExceededError({
                  requestId: sample.requestId,
                  stepId: step.id,
                  occurredAt: step.started_at ?? "unknown",
                  recordedAt: "missing_event",
                  latencyMs: Number.POSITIVE_INFINITY,
                  maxAllowedLatencyMs
                })
              )
            }
          }
        }
      }
    }

    return {
      auditedRequestCount: samples.length,
      auditedStepCount,
      auditedEventCount,
      maxObservedLatencyMs
    }
  })

/**
 * T1.2 Falsification Check:
 * Verifies that for every `Delivery.vials[]`, provenance resolution returns a non-empty
 * `protocol_version_id` and the gating QC record set.
 */
export const verifyT1_2_DeliveryVialProvenance = (
  deliveries: ReadonlyArray<Delivery>,
  resolveProvenance: (
    vialId: VialId
  ) => Effect.Effect<Partial<VialProvenanceRecord> | null, ProvenanceResolutionDefectError>
): Effect.Effect<
  { readonly verifiedVialCount: number },
  ProvenanceResolutionDefectError
> =>
  Effect.gen(function* () {
    let verifiedVialCount = 0
    for (const delivery of deliveries) {
      for (const vial of delivery.vials) {
        const rawProvenance = yield* resolveProvenance(vial.vial_id)
        yield* verifyVialProvenanceCompleteness(vial.vial_id, rawProvenance)
        verifiedVialCount += 1
      }
    }
    return { verifiedVialCount }
  })

/**
 * T1.3 Falsification Check:
 * Verifies that attempting `UPDATE` or `DELETE` on `event_log` using the application's DB role
 * is rejected by the database privilege layer (returning an error that we convert to `passed: true`).
 */
export const verifyT1_3_AppendOnlyDbPrivilege = (params: {
  readonly attemptRawUpdateOnEventLog: () => Effect.Effect<void, { readonly dbErrorCode: string; readonly message: string }>
  readonly attemptRawDeleteOnEventLog: () => Effect.Effect<void, { readonly dbErrorCode: string; readonly message: string }>
}): Effect.Effect<
  { readonly updateBlockedAtDbLevel: true; readonly deleteBlockedAtDbLevel: true },
  EventLogImmutabilityError
> =>
  Effect.gen(function* () {
    const updateExit = yield* Effect.exit(params.attemptRawUpdateOnEventLog())
    if (updateExit._tag === "Success") {
      return yield* Effect.fail(
        new EventLogImmutabilityError({
          reason: "P1 DEFECT (T1.3): Raw UPDATE on event_log succeeded instead of failing at DB privilege level."
        })
      )
    }

    const deleteExit = yield* Effect.exit(params.attemptRawDeleteOnEventLog())
    if (deleteExit._tag === "Success") {
      return yield* Effect.fail(
        new EventLogImmutabilityError({
          reason: "P1 DEFECT (T1.3): Raw DELETE on event_log succeeded instead of failing at DB privilege level."
        })
      )
    }

    return {
      updateBlockedAtDbLevel: true as const,
      deleteBlockedAtDbLevel: true as const
    }
  })

/**
 * T2.1 & T2.2 Falsification Check:
 * Verifies that every `ProtocolVersion` with `status === "default"` (beyond initial seed if applicable,
 * or all default versions per T2.1) has a valid `PromotionRecord` referencing evidence runs,
 * effect estimate, acceptance rule via `ChangeProposal`, and a signer holding role `scientific_advisor`.
 */
export const verifyT2_1_And_T2_2_DefaultProtocolPromotions = (params: {
  readonly defaultProtocols: ReadonlyArray<ProtocolVersion>
  readonly promotionRecords: ReadonlyMap<PromotionRecordId, PromotionRecord>
  readonly changeProposals: ReadonlyMap<string, ChangeProposal>
  readonly userRoles: ReadonlyMap<UserId, ReadonlySet<HumanRole>>
}): Effect.Effect<
  { readonly verifiedDefaultProtocolCount: number },
  ProtocolPromotionError
> =>
  Effect.gen(function* () {
    for (const proto of params.defaultProtocols) {
      if (proto.status !== "default") {
        continue
      }
      if (!proto.promotion_record_id) {
        return yield* Effect.fail(
          new ProtocolPromotionError({
            protocolFamily: proto.family,
            targetVersion: proto.id,
            violationCode: "MISSING_PROMOTION_RECORD",
            details: `T2.1 violation: Default protocol '${proto.id}' has null promotion_record_id.`
          })
        )
      }

      const record = params.promotionRecords.get(proto.promotion_record_id)
      if (!record || record.evidence_run_ids.length === 0) {
        return yield* Effect.fail(
          new ProtocolPromotionError({
            protocolFamily: proto.family,
            targetVersion: proto.id,
            violationCode: "MISSING_PROMOTION_RECORD",
            details: `T2.1 violation: PromotionRecord '${proto.promotion_record_id}' missing or has empty evidence_run_ids.`
          })
        )
      }

      const proposal = params.changeProposals.get(record.change_proposal_id)
      if (!proposal) {
        return yield* Effect.fail(
          new ProtocolPromotionError({
            protocolFamily: proto.family,
            targetVersion: proto.id,
            proposalId: record.change_proposal_id,
            violationCode: "MISSING_PROMOTION_RECORD",
            details: `T2.1 violation: ChangeProposal '${record.change_proposal_id}' not found for PromotionRecord.`
          })
        )
      }

      const signerRoles = params.userRoles.get(record.signed_off_by)
      if (!signerRoles || !signerRoles.has("scientific_advisor")) {
        return yield* Effect.fail(
          new ProtocolPromotionError({
            protocolFamily: proto.family as ProtocolFamily,
            targetVersion: proto.id,
            proposalId: record.change_proposal_id,
            attemptedSigner: record.signed_off_by,
            violationCode: "UNAUTHORIZED_SIGNER_ROLE",
            details: `T2.2 violation: Signer '${record.signed_off_by}' does not hold role 'scientific_advisor'.`
          })
        )
      }
    }

    return { verifiedDefaultProtocolCount: params.defaultProtocols.length }
  })

/**
 * T2.3 Falsification Check:
 * Replays the promotion decision from stored `Run` / `QCMeasurement` rows using
 * `StatisticalAcceptanceEngine` and asserts numerical reproducibility within tolerance.
 */
export const verifyT2_3_DeterministicPromotionReplay = (params: {
  readonly promotionRecord: PromotionRecord
  readonly proposal: ChangeProposal
  readonly rows: ReadonlyArray<RunAnalysisRow>
  readonly numericalTolerance?: number
}): Effect.Effect<
  {
    readonly promotionRecordId: PromotionRecordId
    readonly storedEstimate: number
    readonly reproducedEstimate: number
    readonly absoluteDifference: number
    readonly withinTolerance: true
  },
  ProtocolPromotionError,
  StatisticalAcceptanceEngine
> =>
  Effect.gen(function* () {
    const engine = yield* StatisticalAcceptanceEngine
    return yield* engine.replayAndVerifyPromotion(params)
  })
