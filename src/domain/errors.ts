import { Data } from "effect"
import type {
  BatchId,
  ChangeProposalId,
  EventId,
  LabId,
  ProtocolFamily,
  ProtocolVersionId,
  RequestId,
  RunId,
  Sha256Hash,
  StepId,
  UserId,
  VialId
} from "./ids.ts"

/**
 * §1–§7 Exhaustive Tagged Domain & Policy Errors
 *
 * Every failure mode in the Protein Fab specification is represented as a typed
 * `Data.TaggedError` so Effect channels (`Effect<A, E, R>`) explicitly track
 * biosafety gates, capability violations, falsification defects (P1/P2),
 * and human-in-the-loop fallbacks.
 */

export class BiosafetyBlockedError extends Data.TaggedError("BiosafetyBlockedError")<{
  readonly requestId: RequestId
  readonly screenDatabaseVersion: string
  readonly matchedWatchlistIds: ReadonlyArray<string>
  readonly reason: string
}> {}

export class BiosafetyReviewRequiredError extends Data.TaggedError(
  "BiosafetyReviewRequiredError"
)<{
  readonly requestId: RequestId
  readonly screenDatabaseVersion: string
  readonly flaggedMotifs: ReadonlyArray<string>
  readonly reviewerQueueId: string
}> {}

export class CapabilityViolationError extends Data.TaggedError("CapabilityViolationError")<{
  readonly actorId: string
  readonly role: string
  readonly attemptedOperation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TOOL_CALL"
  readonly targetResource: string
  readonly reason: string
}> {}

export class PromptInjectionGuardError extends Data.TaggedError("PromptInjectionGuardError")<{
  readonly agentRole: string
  readonly offendingFieldPath: string
  readonly message: string
}> {}

export class SchemaValidationDeadLetterError extends Data.TaggedError(
  "SchemaValidationDeadLetterError"
)<{
  readonly agentRole: string
  readonly entityId: string
  readonly rawPayload: unknown
  readonly validationIssues: ReadonlyArray<string>
  readonly deadLetterId: string
}> {}

export class DuplicateIdempotentActionError extends Data.TaggedError(
  "DuplicateIdempotentActionError"
)<{
  readonly entityId: string
  readonly eventCode: string
  readonly existingEventId: EventId
}> {}

export class InvalidStateTransitionError extends Data.TaggedError(
  "InvalidStateTransitionError"
)<{
  readonly entityType: "request" | "batch" | "run" | "step" | "change_proposal" | "protocol_version"
  readonly entityId: string
  readonly fromState: string
  readonly toState: string
  readonly reason: string
}> {}

export class ProtocolBoundsViolationError extends Data.TaggedError(
  "ProtocolBoundsViolationError"
)<{
  readonly protocolVersionId: ProtocolVersionId
  readonly stepKey: string
  readonly parameterName: string
  readonly attemptedValue: number | string | boolean
  readonly allowedRange: { readonly min?: number; readonly max?: number }
}> {}

/**
 * T1.1 Falsification Defect:
 * Event `recorded_at` exceeded maximum allowed latency (15 minutes [ASSUMPTION]) after `occurred_at`,
 * or a closed Run has a Step with 0 events.
 */
export class EventLatencyBoundExceededError extends Data.TaggedError(
  "EventLatencyBoundExceededError"
)<{
  readonly requestId: RequestId
  readonly eventId?: EventId
  readonly stepId?: StepId
  readonly occurredAt: string
  readonly recordedAt: string
  readonly latencyMs: number
  readonly maxAllowedLatencyMs: number
}> {}

/**
 * T1.2 Falsification Defect:
 * A delivered Vial failed to resolve a non-empty `protocol_version_id` or its gating QC record set.
 */
export class ProvenanceResolutionDefectError extends Data.TaggedError(
  "ProvenanceResolutionDefectError"
)<{
  readonly vialId: VialId
  readonly runId?: RunId
  readonly missingComponent: "protocol_version_id" | "gating_qc_records" | "run_record" | "hash_chain"
}> {}

/**
 * T1.3 Falsification Defect:
 * Attempted mutation (`UPDATE` or `DELETE`) on append-only `event_log`, or hash chain verification failure.
 */
export class EventLogImmutabilityError extends Data.TaggedError("EventLogImmutabilityError")<{
  readonly requestId?: RequestId
  readonly eventId?: EventId
  readonly expectedPrevHash?: Sha256Hash
  readonly actualPrevHash?: Sha256Hash
  readonly reason: string
}> {}

/**
 * T2.1 / T2.2 / T2.3 Falsification Defect:
 * Protocol promotion attempted without required evidence, without `scientific_advisor` sign-off,
 * or replay failed to reproduce stored effect estimate within numerical tolerance.
 */
export class ProtocolPromotionError extends Data.TaggedError("ProtocolPromotionError")<{
  readonly protocolFamily: ProtocolFamily
  readonly targetVersion: ProtocolVersionId
  readonly proposalId?: ChangeProposalId
  readonly attemptedSigner?: UserId
  readonly violationCode:
    | "MISSING_PROMOTION_RECORD"
    | "UNAUTHORIZED_SIGNER_ROLE"
    | "ACCEPTANCE_RULE_FAILED"
    | "GENERALIZATION_RULE_FAILED"
    | "REPLAY_ESTIMATE_MISMATCH"
    | "CANARY_CAP_EXCEEDED"
  readonly details: string
}> {}

/**
 * §4 Transparency Privacy Rule:
 * Cluster aggregates must contain >= 5 runs from >= 2 labs [ASSUMPTION].
 */
export class PrivacyCellSizeError extends Data.TaggedError("PrivacyCellSizeError")<{
  readonly constructClassKey: string
  readonly runCount: number
  readonly labCount: number
  readonly minRequiredRuns: number
  readonly minRequiredLabs: number
}> {}

/**
 * §6 Insurance Property Escalation:
 * Reserved 15% batch rework buffer cannot hold the committed delivery date.
 */
export class ReworkBufferExhaustedError extends Data.TaggedError("ReworkBufferExhaustedError")<{
  readonly requestId: RequestId
  readonly runId: RunId
  readonly batchId: BatchId
  readonly committedDeliveryDate: string
  readonly proposedLabOptions: ReadonlyArray<"partial_release" | "new_date" | "cancel_no_charge">
}> {}

/**
 * §7 Degradation:
 * When an agent is disabled (Phase 0) or unavailable, its stage falls back to the human work queue.
 */
export class AgentUnavailableError extends Data.TaggedError("AgentUnavailableError")<{
  readonly agentRole: string
  readonly taskCorrelationId: string
  readonly reason: "phase0_disabled" | "timeout" | "upstream_error"
}> {}

export class RateLimitExceededError extends Data.TaggedError("RateLimitExceededError")<{
  readonly labId: LabId
  readonly operation: string
  readonly retryAfterSeconds: number
}> {}

export type ProdQcDomainError =
  | BiosafetyBlockedError
  | BiosafetyReviewRequiredError
  | CapabilityViolationError
  | PromptInjectionGuardError
  | SchemaValidationDeadLetterError
  | DuplicateIdempotentActionError
  | InvalidStateTransitionError
  | ProtocolBoundsViolationError
  | EventLatencyBoundExceededError
  | ProvenanceResolutionDefectError
  | EventLogImmutabilityError
  | ProtocolPromotionError
  | PrivacyCellSizeError
  | ReworkBufferExhaustedError
  | AgentUnavailableError
  | RateLimitExceededError
