import { Context, Effect } from "effect"
import {
  PrivacyCellSizeError,
  ProvenanceResolutionDefectError
} from "../domain/errors.ts"
import type { EventLogEntry, MilestoneStage } from "../domain/events.ts"
import type {
  DeliveryId,
  IsoCalendarDate,
  LabId,
  ProtocolFamily,
  ProtocolVersionId,
  RequestId,
  Rfc3339UtcTimestamp,
  RunId,
  S3ObjectUri,
  Sha256Hash,
  UserId,
  VialId
} from "../domain/ids.ts"
import type {
  ChangeProposal,
  ConstructClassKey,
  Deviation,
  ExpressionHost,
  ProductLine,
  PromotionRecord,
  ProtocolVersion,
  QCMeasurement,
  Vial
} from "../domain/models.ts"
import type { ClusterTechReport } from "../agents/contracts.ts"
import type { ProtocolVersionDiff } from "./self-improvement.ts"

/**
 * §1 P1 & §4 Transparency Subsystem Abstractions
 *
 * Enforces:
 * - T1.2 Vial Provenance: Every delivered vial resolves its non-empty `protocol_version_id`,
 *   run metadata, cold chain log, and exact gating `QCMeasurement` set without human intervention.
 * - Three strict audience views:
 *   1. Requesting Lab View (fine-grained events, actual step params, raw QC signed URLs, full provenance)
 *   2. Cluster Public View (coarse milestones without sequences/annotations; construct-class aggregates
 *      enforcing `>= 5 runs` from `>= 2 labs` minimum cell size)
 *   3. Fab Internal View (operator identities, supplier pricing, capacity forecasts, unredacted post-mortems)
 */

export const MIN_CLUSTER_CELL_RUNS = 5 // [ASSUMPTION] §4
export const MIN_CLUSTER_CELL_LABS = 2 // [ASSUMPTION] §4
export const MAX_EVENT_LATENCY_MS = 15 * 60 * 1000 // 15 minutes [ASSUMPTION] T1.1

/**
 * Enforces §4 minimum aggregation cell size (`>= 5 runs` from `>= 2 distinct labs`).
 */
export const enforceClusterPrivacyCellSize = <A>(params: {
  readonly constructClassKey: string
  readonly runCount: number
  readonly distinctLabCount: number
  readonly aggregateData: A
  readonly minRuns?: number
  readonly minLabs?: number
}): Effect.Effect<A, PrivacyCellSizeError> => {
  const minRequiredRuns = params.minRuns ?? MIN_CLUSTER_CELL_RUNS
  const minRequiredLabs = params.minLabs ?? MIN_CLUSTER_CELL_LABS
  if (
    params.runCount < minRequiredRuns ||
    params.distinctLabCount < minRequiredLabs
  ) {
    return Effect.fail(
      new PrivacyCellSizeError({
        constructClassKey: params.constructClassKey,
        runCount: params.runCount,
        labCount: params.distinctLabCount,
        minRequiredRuns,
        minRequiredLabs
      })
    )
  }
  return Effect.succeed(params.aggregateData)
}

// ---------------------------------------------------------------------------
// 1. Vial Provenance Record (T1.2)
// ---------------------------------------------------------------------------

export interface VialProvenanceRecord {
  readonly vial: Vial
  readonly delivery_id: DeliveryId
  readonly request_id: RequestId
  readonly run_id: RunId
  readonly protocol_version_id: ProtocolVersionId
  readonly protocol_version: ProtocolVersion
  readonly parent_protocol_diff: ProtocolVersionDiff | null
  readonly gating_qc_measurements: ReadonlyArray<
    QCMeasurement & { readonly signed_raw_file_url: string }
  >
  readonly cold_chain_log_uri: S3ObjectUri
  readonly event_chain_head: Sha256Hash
  readonly released_by: UserId
  readonly delivered_at: Rfc3339UtcTimestamp | null
}

/**
 * Pure verifier for T1.2 Falsification Test:
 * Fails with `ProvenanceResolutionDefectError` if `protocol_version_id` is empty or
 * if no gating QC measurements are bound to the delivered vial.
 */
export const verifyVialProvenanceCompleteness = (
  vialId: VialId,
  provenance: Partial<VialProvenanceRecord> | null | undefined
): Effect.Effect<VialProvenanceRecord, ProvenanceResolutionDefectError> =>
  Effect.gen(function* () {
    if (!provenance || !provenance.run_id) {
      return yield* Effect.fail(
        new ProvenanceResolutionDefectError({
          vialId,
          missingComponent: "run_record"
        })
      )
    }
    if (!provenance.protocol_version_id || !provenance.protocol_version) {
      return yield* Effect.fail(
        new ProvenanceResolutionDefectError({
          vialId,
          runId: provenance.run_id,
          missingComponent: "protocol_version_id"
        })
      )
    }
    if (
      !provenance.gating_qc_measurements ||
      provenance.gating_qc_measurements.length === 0
    ) {
      return yield* Effect.fail(
        new ProvenanceResolutionDefectError({
          vialId,
          runId: provenance.run_id,
          missingComponent: "gating_qc_records"
        })
      )
    }
    if (!provenance.event_chain_head) {
      return yield* Effect.fail(
        new ProvenanceResolutionDefectError({
          vialId,
          runId: provenance.run_id,
          missingComponent: "hash_chain"
        })
      )
    }
    return provenance as VialProvenanceRecord
  })

// ---------------------------------------------------------------------------
// 2. Audience-Scoped Projections (§4 Table)
// ---------------------------------------------------------------------------

/**
 * Coarse milestone timeline visible to the whole cluster for `cluster_shared` requests.
 * Notice: NO sequences, NO design annotations, and NO `target_description_structured` exist on this type.
 */
export interface ClusterMilestoneTimeline {
  readonly request_id: RequestId
  readonly product_line: ProductLine
  readonly construct_class: ConstructClassKey
  readonly protocol_family: ProtocolFamily
  readonly protocol_version_id: ProtocolVersionId
  readonly milestones: ReadonlyArray<{
    readonly stage: MilestoneStage
    readonly reached_at: Rfc3339UtcTimestamp
    readonly event_id: number
  }>
}

export interface DeIdentifiedClusterStats {
  readonly construct_class: ConstructClassKey
  readonly window_from: IsoCalendarDate
  readonly window_to: IsoCalendarDate
  readonly n_runs: number
  readonly n_labs: number
  readonly first_pass_qc_rate: number
  readonly median_yield_mg: number
  readonly iqr_yield_mg: readonly [number, number]
  readonly fab_reliability: {
    readonly deviations_per_100_runs: number
    readonly share_absorbed_by_fab: number
    readonly on_time_rate_against_committed_date: number
  }
}

export interface TransparencyServiceShape {
  /**
   * Requesting Lab View: full event timeline, `Step.actual_params`, all `QCMeasurement`s
   * with short-lived signed URLs, every `Deviation` with cause attribution, and vial provenance.
   */
  readonly getLabRequestTimeline: (params: {
    readonly callerLabId: LabId
    readonly requestId: RequestId
    readonly granularity: "milestone" | "full"
  }) => Effect.Effect<{
    readonly request_id: RequestId
    readonly events: ReadonlyArray<EventLogEntry>
    readonly chain_head: Sha256Hash
  }>

  readonly getVialProvenance: (params: {
    readonly callerLabId: LabId
    readonly vialId: VialId
  }) => Effect.Effect<VialProvenanceRecord, ProvenanceResolutionDefectError>

  readonly getLabDeviations: (params: {
    readonly callerLabId: LabId
    readonly requestId: RequestId
  }) => Effect.Effect<ReadonlyArray<Deviation>>

  /**
   * Cluster Public View: de-identified aggregates keyed on `ConstructClassKey`,
   * enforcing `>= 5 runs` from `>= 2 labs` (§4).
   */
  readonly getClusterStats: (params: {
    readonly host?: ExpressionHost
    readonly constructClass?: ConstructClassKey
    readonly from: IsoCalendarDate
    readonly to: IsoCalendarDate
  }) => Effect.Effect<ReadonlyArray<DeIdentifiedClusterStats>, PrivacyCellSizeError>

  readonly getClusterTechReports: () => Effect.Effect<ReadonlyArray<ClusterTechReport>>

  readonly getClusterProposalsAndPromotions: () => Effect.Effect<{
    readonly proposals: ReadonlyArray<ChangeProposal>
    readonly promotions: ReadonlyArray<PromotionRecord>
  }>
}

export class TransparencyService extends Context.Tag(
  "prodqc-agent/TransparencyService"
)<TransparencyService, TransparencyServiceShape>() {}
