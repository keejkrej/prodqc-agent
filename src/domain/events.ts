import { Context, Effect, Schema, Stream } from "effect"
import type {
  DuplicateIdempotentActionError,
  EventLatencyBoundExceededError,
  EventLogImmutabilityError
} from "./errors.ts"
import {
  BatchId,
  DeliveryId,
  DeviationId,
  EventId,
  IsoCalendarDate,
  PromotionRecordId,
  ProtocolVersionId,
  QCMeasurementId,
  RequestId,
  Rfc3339UtcTimestamp,
  RunId,
  Sha256Hash,
  StepId,
  VialId
} from "./ids.ts"
import {
  AssignmentArm,
  BiosafetyScreenVerdict,
  CauseAttribution,
  DeviationCategory,
  DownstreamStudyType,
  LnpQcDispositionAction,
  ParameterValue,
  QCVerdict,
  RequestState
} from "./models.ts"

/**
 * §1 P1, §3.3 & §4 Append-Only Hash-Chained Event Log Abstractions
 *
 * - Closed, versioned `event_code` vocabulary with typed discriminated payloads.
 * - `event_log` is strictly insert-only (`INSERT, SELECT`; zero `UPDATE`/`DELETE`).
 * - Corrections are represented as compensating events (`*.compensated`).
 * - Each row hashes `sha256(prev_hash || canonical_json(row minus hash))` forming a
 *   per-request hash chain independently verifiable by the requesting lab.
 */

export const EventEntityType = Schema.Literal(
  "request",
  "batch",
  "run",
  "step",
  "qc",
  "deviation",
  "delivery",
  "protocol_version"
)
export type EventEntityType = typeof EventEntityType.Type

export const EventVisibility = Schema.Literal(
  "public_cluster",
  "lab_only",
  "internal"
)
export type EventVisibility = typeof EventVisibility.Type

export const EventActorType = Schema.Literal("agent", "human", "instrument")
export type EventActorType = typeof EventActorType.Type

export const MilestoneStage = Schema.Literal(
  "submitted",
  "screened",
  "scheduled",
  "expression",
  "purification",
  "qc",
  "released",
  "shipped",
  "delivered"
)
export type MilestoneStage = typeof MilestoneStage.Type

// ---------------------------------------------------------------------------
// Closed Vocabulary of Event Codes & Typed Payloads
// ---------------------------------------------------------------------------

export const EventPayloadUnion = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("request.submitted"),
    state: RequestState
  }),
  Schema.Struct({
    _tag: Schema.Literal("request.screened"),
    screen_result: BiosafetyScreenVerdict,
    database_version: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal("request.triaged"),
    accepted: Schema.Boolean,
    feasibility_score: Schema.Number,
    recommended_host: Schema.String
  }),
  Schema.Struct({
    _tag: Schema.Literal("request.scheduled"),
    batch_id: BatchId,
    committed_delivery_date: IsoCalendarDate
  }),
  Schema.Struct({
    _tag: Schema.Literal("run.started"),
    protocol_version_id: ProtocolVersionId,
    arm: AssignmentArm
  }),
  Schema.Struct({
    _tag: Schema.Literal("run.rescheduled"),
    new_batch_id: BatchId,
    no_charge: Schema.Boolean
  }),
  Schema.Struct({
    _tag: Schema.Literal("run.completed"),
    outcome: Schema.Literal("success", "partial", "failed"),
    yield_mg: Schema.NullOr(Schema.Number),
    purity_pct: Schema.NullOr(Schema.Number)
  }),
  Schema.Struct({
    _tag: Schema.Literal("step.started"),
    step_id: StepId,
    protocol_step_key: Schema.String,
    planned_params: Schema.Record({ key: Schema.String, value: ParameterValue })
  }),
  Schema.Struct({
    _tag: Schema.Literal("step.completed"),
    step_id: StepId,
    protocol_step_key: Schema.String,
    actual_params: Schema.Record({ key: Schema.String, value: ParameterValue })
  }),
  Schema.Struct({
    _tag: Schema.Literal("qc.measured"),
    measurement_id: QCMeasurementId,
    verdict: QCVerdict
  }),
  Schema.Struct({
    _tag: Schema.Literal("qc.decided"),
    action: LnpQcDispositionAction,
    rule_id: Schema.String,
    rule_applied: Schema.String,
    downstream_study_type: DownstreamStudyType,
    classification: Schema.Literal("in_spec", "borderline", "hard_fail"),
    borderline_batch: Schema.Boolean,
    specs_evaluated: Schema.Number.pipe(Schema.int(), Schema.positive()),
    specs_missed: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    all_misses_within_borderline_band: Schema.Boolean,
    spec_miss_summary: Schema.String,
    pdi: Schema.Number,
    pdi_max: Schema.Number,
    pdi_borderline_max: Schema.Number,
    ee_pct: Schema.Number,
    ee_pct_min: Schema.Number,
    ee_pct_borderline_min: Schema.Number,
    size_drift_nm: Schema.Number,
    size_drift_nm_max: Schema.Number,
    size_drift_nm_borderline_max: Schema.Number,
    operator_id: Schema.String,
    agent_id: Schema.String,
    simulated: Schema.Literal(true)
  }),
  Schema.Struct({
    _tag: Schema.Literal("qc.signed_off"),
    outcome: Schema.Literal("accepted"),
    recommended_action: LnpQcDispositionAction,
    final_action: LnpQcDispositionAction,
    signer_name: Schema.String.pipe(Schema.minLength(1)),
    reason: Schema.Null,
    simulated: Schema.Literal(true)
  }),
  Schema.Struct({
    _tag: Schema.Literal("qc.signed_off"),
    outcome: Schema.Literal("overridden"),
    recommended_action: LnpQcDispositionAction,
    final_action: LnpQcDispositionAction,
    signer_name: Schema.String.pipe(Schema.minLength(1)),
    reason: Schema.String.pipe(Schema.minLength(1)),
    simulated: Schema.Literal(true)
  }),
  Schema.Struct({
    _tag: Schema.Literal("deviation.opened"),
    deviation_id: DeviationId,
    category: DeviationCategory,
    cause_attribution: CauseAttribution,
    client_bears_cost: Schema.Boolean,
    delay_days: Schema.Number
  }),
  Schema.Struct({
    _tag: Schema.Literal("deviation.resolved"),
    deviation_id: DeviationId,
    resolution: Schema.Literal("rerun", "reschedule", "partial_release", "cancel"),
    committed_date_held: Schema.Boolean
  }),
  Schema.Struct({
    _tag: Schema.Literal("delivery.released"),
    delivery_id: DeliveryId,
    vial_ids: Schema.Array(VialId)
  }),
  Schema.Struct({
    _tag: Schema.Literal("delivery.shipped"),
    delivery_id: DeliveryId,
    handoff_method: Schema.Literal("cluster_courier", "hand_pickup")
  }),
  Schema.Struct({
    _tag: Schema.Literal("delivery.delivered"),
    delivery_id: DeliveryId,
    delivered_at: Rfc3339UtcTimestamp
  }),
  Schema.Struct({
    _tag: Schema.Literal("protocol.promoted"),
    from_version: ProtocolVersionId,
    to_version: ProtocolVersionId,
    promotion_record_id: PromotionRecordId
  }),
  Schema.Struct({
    _tag: Schema.Literal("protocol.rolled_back"),
    demoted_version: ProtocolVersionId,
    restored_parent_version: ProtocolVersionId,
    qc_rate_drop_se: Schema.Number
  }),
  Schema.Struct({
    _tag: Schema.Literal("event.compensated"),
    compensates_event_id: EventId,
    reason_code: Schema.String,
    corrected_values: Schema.Record({ key: Schema.String, value: ParameterValue })
  })
)
export type EventPayload = typeof EventPayloadUnion.Type
export type EventCode = EventPayload["_tag"]

export class EventLogEntry extends Schema.Class<EventLogEntry>("EventLogEntry")({
  event_id: EventId,
  request_id: RequestId,
  entity_type: EventEntityType,
  entity_id: Schema.String,
  event_code: Schema.String,
  visibility: EventVisibility,
  actor_type: EventActorType,
  actor_id: Schema.String,
  payload: EventPayloadUnion,
  occurred_at: Rfc3339UtcTimestamp,
  recorded_at: Rfc3339UtcTimestamp,
  prev_hash: Sha256Hash,
  hash: Sha256Hash
}) {}

export interface AppendEventInput {
  readonly request_id: RequestId
  readonly entity_type: EventEntityType
  readonly entity_id: string
  readonly visibility: EventVisibility
  readonly actor_type: EventActorType
  readonly actor_id: string
  readonly payload: EventPayload
  readonly occurred_at: Rfc3339UtcTimestamp
}

export interface HashChainVerificationReport {
  readonly request_id: RequestId
  readonly verified_event_count: number
  readonly chain_head: Sha256Hash
  readonly max_observed_latency_ms: number
}

/**
 * §1 P1 & §3.3 Append-Only Event Log Service Abstraction
 *
 * Notice there are NO `update` or `delete` methods in this contract.
 * Any attempt to mutate at the storage privilege level is verified by `verifyAppendOnlyPrivilege` (T1.3).
 */
export interface EventLogServiceShape {
  /**
   * Appends a new event to the request's hash chain.
   * Enforces:
   * - Idempotency per `(entity_id, event_code)` for agent actors (§7)
   * - Bounded latency check `recorded_at - occurred_at <= maxLatencyMs` (default 15 min, T1.1)
   * - Cryptographic hash chaining `sha256(prev_hash || canonical_json(row minus hash))`
   */
  readonly append: (
    input: AppendEventInput
  ) => Effect.Effect<
    EventLogEntry,
    | DuplicateIdempotentActionError
    | EventLatencyBoundExceededError
    | EventLogImmutabilityError
  >

  /**
   * Retrieves the ordered event timeline for a request, filtered by audience visibility
   * and granularity (`milestone` vs `full`).
   */
  readonly getRequestTimeline: (params: {
    readonly requestId: RequestId
    readonly granularity: "milestone" | "full"
    readonly maxVisibility: EventVisibility
  }) => Effect.Effect<
    {
      readonly request_id: RequestId
      readonly events: ReadonlyArray<EventLogEntry>
      readonly chain_head: Sha256Hash
    },
    EventLogImmutabilityError
  >

  /**
   * Verifies the cryptographic hash chain and latency bounds for a request (T1.1 & T1.3).
   */
  readonly verifyRequestChain: (
    requestId: RequestId,
    maxAllowedLatencyMs?: number
  ) => Effect.Effect<
    HashChainVerificationReport,
    EventLogImmutabilityError | EventLatencyBoundExceededError
  >

  /**
   * Streams incremental events since `sinceEventId` (`GET /v1/events` & `wss://.../v1/events`).
   */
  readonly streamSince: (params: {
    readonly sinceEventId?: EventId
    readonly maxVisibility: EventVisibility
  }) => Stream.Stream<EventLogEntry, EventLogImmutabilityError>
}

export class EventLogService extends Context.Tag(
  "prodqc-agent/EventLogService"
)<EventLogService, EventLogServiceShape>() {}
