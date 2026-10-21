import { Context, Effect } from "effect"
import {
  AgentUnavailableError,
  type BiosafetyBlockedError,
  type BiosafetyReviewRequiredError,
  type CapabilityViolationError,
  InvalidStateTransitionError,
  type PromptInjectionGuardError,
  type ProtocolBoundsViolationError,
  type ReworkBufferExhaustedError,
  type SchemaValidationDeadLetterError
} from "../domain/errors.ts"
import type {
  AgentSafeProjection,
  BatchId,
  IsoCalendarDate,
  ProtocolFamily,
  ProtocolVersionId,
  RequestId,
  Rfc3339UtcTimestamp,
  RunId,
  Sha256Hash,
  StepId
} from "../domain/ids.ts"
import type {
  AssignmentArm,
  Batch,
  BiosafetyScreenRecord,
  ChangeProposal,
  Construct,
  ConstructClassKey,
  Design,
  Deviation,
  ExpressionHost,
  InstrumentEvent,
  ParameterValue,
  ProtocolVersion,
  QCMeasurement,
  ReleaseSpec,
  Request,
  RequestState,
  Run,
  Step
} from "../domain/models.ts"
import type { AgentCapabilityToken, AgentRole } from "../security/capabilities.ts"

/**
 * §2.1 & §7 Multi-Agent System Contracts & Human Work Queue Fallback
 *
 * Key architectural guarantees:
 * 1. The Orchestrator is a deterministic state machine that routes requests and never decides science.
 * 2. Every specialist agent requires its scoped `AgentCapabilityToken<Role>` and operates solely on
 *    `AgentSafeProjection<T>` (never prose `notes`/`rationale`).
 * 3. Degradation (§7): "If an agent is unavailable, its stage falls back to a human work queue;
 *    the state machine and event log keep functioning. The system must be operable with every agent
 *    disabled (that is exactly Phase 0)."
 */

// ---------------------------------------------------------------------------
// 1. Human Work Queue & Phase 0 / Degraded Mode Combinator (§7, §8)
// ---------------------------------------------------------------------------

export interface HumanWorkQueueTask<Input = unknown> {
  readonly taskId: string
  readonly stage: Exclude<AgentRole, "orchestrator">
  readonly requestId: RequestId
  readonly entityId: string
  readonly reason: "phase0_disabled" | "timeout" | "upstream_error" | "policy_escalation"
  readonly sanitizedInput: AgentSafeProjection<Input>
  readonly enqueuedAt: Rfc3339UtcTimestamp
}

export interface HumanStageResolution<Output> {
  readonly _tag: "HumanQueued" | "AgentCompleted"
  readonly output?: Output
  readonly queuedTask?: HumanWorkQueueTask
}

export interface HumanWorkQueueServiceShape {
  readonly enqueueStageFallback: <Input>(params: {
    readonly stage: Exclude<AgentRole, "orchestrator">
    readonly requestId: RequestId
    readonly entityId: string
    readonly reason: "phase0_disabled" | "timeout" | "upstream_error" | "policy_escalation"
    readonly input: AgentSafeProjection<Input>
  }) => Effect.Effect<HumanWorkQueueTask<Input>>

  readonly listPendingTasks: (
    stage?: Exclude<AgentRole, "orchestrator">
  ) => Effect.Effect<ReadonlyArray<HumanWorkQueueTask>>
}

export class HumanWorkQueueService extends Context.Tag(
  "prodqc-agent/HumanWorkQueueService"
)<HumanWorkQueueService, HumanWorkQueueServiceShape>() {}

/**
 * Combinator implementing §7 Degradation:
 * Runs an agent stage; if it fails with `AgentUnavailableError` (including Phase 0 where all
 * agents are disabled), automatically routes the stage to `HumanWorkQueueService` without
 * halting the state machine or event log.
 */
export const withHumanQueueFallback = <Input, Output, E, R>(params: {
  readonly stage: Exclude<AgentRole, "orchestrator">
  readonly requestId: RequestId
  readonly entityId: string
  readonly input: AgentSafeProjection<Input>
  readonly runAgent: (
    input: AgentSafeProjection<Input>
  ) => Effect.Effect<Output, E | AgentUnavailableError, R>
}): Effect.Effect<
  HumanStageResolution<Output>,
  Exclude<E, AgentUnavailableError>,
  R | HumanWorkQueueService
> =>
  params.runAgent(params.input).pipe(
    Effect.map(
      (output): HumanStageResolution<Output> => ({
        _tag: "AgentCompleted",
        output
      })
    ),
    Effect.catchAll((err) => {
      if (err instanceof AgentUnavailableError) {
        return Effect.gen(function* () {
          const queue = yield* HumanWorkQueueService
          const queuedTask = yield* queue.enqueueStageFallback({
            stage: params.stage,
            requestId: params.requestId,
            entityId: params.entityId,
            reason: err.reason,
            input: params.input
          })
          return {
            _tag: "HumanQueued",
            queuedTask
          } as HumanStageResolution<Output>
        })
      }
      return Effect.fail(err as Exclude<E, AgentUnavailableError>)
    })
  )

// ---------------------------------------------------------------------------
// 2. Deterministic Request State Machine (§2.1 Orchestrator)
// ---------------------------------------------------------------------------

export const ALLOWED_REQUEST_TRANSITIONS: Record<
  RequestState,
  ReadonlySet<RequestState>
> = {
  submitted: new Set(["screening", "cancelled"]),
  screening: new Set(["triaged", "cancelled", "failed"]),
  triaged: new Set(["scheduled", "cancelled", "failed"]),
  scheduled: new Set(["in_production", "cancelled"]),
  in_production: new Set(["qc", "scheduled", "failed"]), // `scheduled` allowed on rework reschedule (§6)
  qc: new Set(["released", "in_production", "scheduled", "failed"]),
  released: new Set(["shipped"]),
  shipped: new Set(["delivered", "failed"]),
  delivered: new Set([]),
  cancelled: new Set([]),
  failed: new Set([])
}

export const validateRequestTransition = (
  requestId: RequestId,
  fromState: RequestState,
  toState: RequestState
): Effect.Effect<RequestState, InvalidStateTransitionError> =>
  ALLOWED_REQUEST_TRANSITIONS[fromState].has(toState)
    ? Effect.succeed(toState)
    : Effect.fail(
        new InvalidStateTransitionError({
          entityType: "request",
          entityId: requestId,
          fromState,
          toState,
          reason: `Deterministic state machine forbids transition from '${fromState}' to '${toState}'.`
        })
      )

export interface OrchestratorServiceShape {
  readonly token: AgentCapabilityToken<"orchestrator">

  readonly transitionRequestState: (params: {
    readonly request: AgentSafeProjection<Request>
    readonly targetState: RequestState
    readonly occurredAt: Rfc3339UtcTimestamp
  }) => Effect.Effect<
    AgentSafeProjection<Request>,
    InvalidStateTransitionError | CapabilityViolationError
  >

  /**
   * Cancels a request only if it has not yet entered `in_production` (`POST /v1/requests/{id}/cancel`, §4.1).
   */
  readonly cancelRequestBeforeProduction: (params: {
    readonly request: AgentSafeProjection<Request>
    readonly occurredAt: Rfc3339UtcTimestamp
  }) => Effect.Effect<
    AgentSafeProjection<Request>,
    InvalidStateTransitionError | CapabilityViolationError
  >
}

export class OrchestratorService extends Context.Tag(
  "prodqc-agent/OrchestratorService"
)<OrchestratorService, OrchestratorServiceShape>() {}

// ---------------------------------------------------------------------------
// 3. Biosafety Screening & Intake / Design-Triage Agent (§2.1, §7)
// ---------------------------------------------------------------------------

export interface BiosafetyScreeningServiceShape {
  /**
   * Screens submitted sequences against controlled sequence watchlists, homology sets,
   * and toxin/select-agent keyword/motif policies (§7).
   * - `block` fails with `BiosafetyBlockedError` (never auto-overridable by an agent)
   * - `review` fails with `BiosafetyReviewRequiredError` (halts and notifies biosafety reviewer)
   * - `clear` returns `BiosafetyScreenRecord`
   */
  readonly screenDesigns: (params: {
    readonly requestId: RequestId
    readonly designs: ReadonlyArray<AgentSafeProjection<Design>>
  }) => Effect.Effect<
    BiosafetyScreenRecord,
    BiosafetyBlockedError | BiosafetyReviewRequiredError
  >
}

export class BiosafetyScreeningService extends Context.Tag(
  "prodqc-agent/BiosafetyScreeningService"
)<BiosafetyScreeningService, BiosafetyScreeningServiceShape>() {}

export interface TriageVerdict {
  readonly requestId: RequestId
  readonly autoAccepted: boolean
  readonly requiresHumanReview: boolean
  readonly proposedConstructs: ReadonlyArray<Construct>
  readonly recommendedHost: ExpressionHost
  readonly aggregateFeasibilityScore: number
}

export interface IntakeTriageAgentShape {
  readonly token: AgentCapabilityToken<"intake_triage">
  /**
   * Default auto-accept threshold (e.g. `0.75`); auto-accepts only if biosafety screen is `clear`
   * and `feasibility.score >= autoAcceptThreshold`, otherwise queues human review (§2.1).
   */
  readonly autoAcceptThreshold: number

  readonly evaluateIntake: (params: {
    readonly request: AgentSafeProjection<Request>
    readonly designs: ReadonlyArray<AgentSafeProjection<Design>>
    readonly priorSimilarRuns: ReadonlyArray<AgentSafeProjection<Run>>
  }) => Effect.Effect<
    TriageVerdict,
    | BiosafetyBlockedError
    | BiosafetyReviewRequiredError
    | CapabilityViolationError
    | PromptInjectionGuardError
    | SchemaValidationDeadLetterError
    | AgentUnavailableError
  >
}

export class IntakeTriageAgent extends Context.Tag(
  "prodqc-agent/IntakeTriageAgent"
)<IntakeTriageAgent, IntakeTriageAgentShape>() {}

// ---------------------------------------------------------------------------
// 4. Planning / Scheduling Agent (§2.1, §6)
// ---------------------------------------------------------------------------

export interface CapacityEnvelopeSlot {
  readonly batchId: BatchId
  readonly expressionHost: ExpressionHost
  readonly scheduledStart: Rfc3339UtcTimestamp
  readonly totalCapacitySlots: number
  readonly reservedReworkSlots: number // Target 15% of batch slots [ASSUMPTION] (§6)
  readonly availableStandardSlots: number
  readonly availableReworkSlots: number
}

export interface ScheduleProposal {
  readonly requestId: RequestId
  readonly assignedBatch: Batch
  readonly plannedRuns: ReadonlyArray<Run>
  readonly committedDeliveryDate: IsoCalendarDate
  readonly autoCommittedWithinEnvelope: boolean
}

export interface PlanningSchedulingAgentShape {
  readonly token: AgentCapabilityToken<"planning_scheduling">
  readonly reworkBufferFractionTarget: number // Default 0.15 (15% [ASSUMPTION])

  readonly scheduleTriagedRequest: (params: {
    readonly request: AgentSafeProjection<Request>
    readonly constructs: ReadonlyArray<AgentSafeProjection<Construct>>
    readonly capacityCalendar: ReadonlyArray<CapacityEnvelopeSlot>
  }) => Effect.Effect<
    ScheduleProposal,
    | CapabilityViolationError
    | PromptInjectionGuardError
    | SchemaValidationDeadLetterError
    | AgentUnavailableError
  >

  /**
   * §6 Insurance Property Absorption:
   * Allocates a re-run slot from the reserved 15% rework buffer while holding `committed_delivery_date`.
   * Fails with `ReworkBufferExhaustedError` if no buffer slot can meet the committed date.
   */
  readonly allocateReworkSlotForDeviation: (params: {
    readonly request: AgentSafeProjection<Request>
    readonly failedRun: AgentSafeProjection<Run>
    readonly deviation: AgentSafeProjection<Deviation>
    readonly capacityCalendar: ReadonlyArray<CapacityEnvelopeSlot>
  }) => Effect.Effect<
    {
      readonly newBatchId: BatchId
      readonly rescheduledRun: Run
      readonly committedDateHeld: true
      readonly noCharge: true
    },
    | ReworkBufferExhaustedError
    | CapabilityViolationError
    | AgentUnavailableError
  >
}

export class PlanningSchedulingAgent extends Context.Tag(
  "prodqc-agent/PlanningSchedulingAgent"
)<PlanningSchedulingAgent, PlanningSchedulingAgentShape>() {}

// ---------------------------------------------------------------------------
// 5. Protocol Agent (§2.1, §5, §7)
// ---------------------------------------------------------------------------

export interface ProtocolSelectionResult {
  readonly runId: RunId
  readonly protocolVersionId: ProtocolVersionId
  readonly assignmentArm: AssignmentArm
  readonly parameterBindings: Readonly<Record<string, ParameterValue>>
}

export interface ProtocolAgentShape {
  readonly token: AgentCapabilityToken<"protocol">

  /**
   * Selects among registered `default` or `canary` protocol versions (never `draft`)
   * and binds parameters strictly inside declared `params_schema` bounds (§2.1, §7).
   * Cannot author or promote protocol versions.
   */
  readonly selectAndBindProtocol: (params: {
    readonly run: AgentSafeProjection<Run>
    readonly construct: AgentSafeProjection<Construct>
    readonly eligibleVersions: ReadonlyArray<AgentSafeProjection<ProtocolVersion>>
  }) => Effect.Effect<
    ProtocolSelectionResult,
    | ProtocolBoundsViolationError
    | CapabilityViolationError
    | PromptInjectionGuardError
    | SchemaValidationDeadLetterError
    | AgentUnavailableError
  >
}

export class ProtocolAgent extends Context.Tag(
  "prodqc-agent/ProtocolAgent"
)<ProtocolAgent, ProtocolAgentShape>() {}

// ---------------------------------------------------------------------------
// 6. Execution / Instrument-Liaison Agent (§2.1, §6)
// ---------------------------------------------------------------------------

export interface WorkOrder {
  readonly workOrderId: string
  readonly batchId: BatchId
  readonly runId: RunId
  readonly stepId: StepId
  readonly protocolStepKey: string
  readonly targetInstrumentId?: string
  readonly plannedParams: Readonly<Record<string, ParameterValue>>
}

export interface ExecutionLiaisonAgentShape {
  readonly token: AgentCapabilityToken<"execution_liaison">

  readonly emitWorkOrdersForRun: (params: {
    readonly run: AgentSafeProjection<Run>
    readonly protocolVersion: AgentSafeProjection<ProtocolVersion>
  }) => Effect.Effect<
    ReadonlyArray<WorkOrder>,
    CapabilityViolationError | AgentUnavailableError
  >

  /**
   * Interprets machine telemetry (`InstrumentEvent`) and records `Step` actuals;
   * never silently alters a step (§2.1). Any out-of-bounds parameter or instrument error
   * opens a `Deviation`.
   */
  readonly ingestStepTelemetry: (params: {
    readonly step: AgentSafeProjection<Step>
    readonly protocolVersion: AgentSafeProjection<ProtocolVersion>
    readonly events: ReadonlyArray<AgentSafeProjection<InstrumentEvent>>
  }) => Effect.Effect<
    {
      readonly updatedStep: Step
      readonly openedDeviations: ReadonlyArray<Deviation>
    },
    CapabilityViolationError | ProtocolBoundsViolationError | AgentUnavailableError
  >
}

export class ExecutionLiaisonAgent extends Context.Tag(
  "prodqc-agent/ExecutionLiaisonAgent"
)<ExecutionLiaisonAgent, ExecutionLiaisonAgentShape>() {}

// ---------------------------------------------------------------------------
// 7. QC Agent & LNP Formulation Agent (§2.1)
// ---------------------------------------------------------------------------

export interface QCEvaluationOutcome {
  readonly runId: RunId
  readonly verdict: "auto_pass" | "fail_rework" | "escalate_human_incomplete_or_oos"
  readonly evaluatedMeasurements: ReadonlyArray<QCMeasurement>
  readonly missingRequiredMetrics: ReadonlyArray<string>
  readonly openedDeviation: Deviation | null
}

export interface QCAgentShape {
  readonly token: AgentCapabilityToken<"qc">

  /**
   * §2.1: "Auto-pass only on in-spec, fully populated measurement sets; any gap -> human."
   */
  readonly evaluateRunQC: (params: {
    readonly run: AgentSafeProjection<Run>
    readonly measurements: ReadonlyArray<AgentSafeProjection<QCMeasurement>>
    readonly releaseSpec: AgentSafeProjection<ReleaseSpec>
  }) => Effect.Effect<
    QCEvaluationOutcome,
    | CapabilityViolationError
    | PromptInjectionGuardError
    | SchemaValidationDeadLetterError
    | AgentUnavailableError
  >
}

export class QCAgent extends Context.Tag(
  "prodqc-agent/QCAgent"
)<QCAgent, QCAgentShape>() {}

export interface LipidInventoryItem {
  readonly lipidId: string
  readonly lotNumber: string
  readonly availableMg: number
  readonly expiresAt: IsoCalendarDate
}

export interface LnpFormulationAgentShape {
  readonly token: AgentCapabilityToken<"lnp_formulation">

  readonly planFormulationRun: (params: {
    readonly request: AgentSafeProjection<Request>
    readonly payloadConstruct: AgentSafeProjection<Construct>
    readonly lipidInventory: ReadonlyArray<LipidInventoryItem>
    readonly eligibleProtocols: ReadonlyArray<AgentSafeProjection<ProtocolVersion>>
  }) => Effect.Effect<
    {
      readonly formulationRun: Run
      readonly selectedProtocolVersionId: ProtocolVersionId
    },
    | ProtocolBoundsViolationError
    | CapabilityViolationError
    | AgentUnavailableError
  >
}

export class LnpFormulationAgent extends Context.Tag(
  "prodqc-agent/LnpFormulationAgent"
)<LnpFormulationAgent, LnpFormulationAgentShape>() {}

// ---------------------------------------------------------------------------
// 8. Reporting Agent — Query-Hash Verified Numbers Only (§2.1, §4, §8)
// ---------------------------------------------------------------------------

/**
 * §4 Auto-generated tech reports:
 * "Reports are generated from SQL views only; the agent writes prose around numbers
 * it cannot alter, and each number carries the query hash that produced it."
 */
export interface QueryHashVerifiedScalar<T = number> {
  readonly value: T
  readonly sql_view_name: string
  readonly query_hash: Sha256Hash
  readonly computed_at: Rfc3339UtcTimestamp
}

export interface ConstructClassYieldDistribution {
  readonly construct_class: ConstructClassKey
  readonly run_count: QueryHashVerifiedScalar<number>
  readonly distinct_labs: QueryHashVerifiedScalar<number>
  readonly first_pass_qc_rate: QueryHashVerifiedScalar<number>
  readonly yield_mg_p50: QueryHashVerifiedScalar<number>
  readonly yield_mg_p90: QueryHashVerifiedScalar<number>
}

export interface ClusterTechReport {
  readonly report_id: string
  readonly period_month: string // e.g. "2026-11"
  readonly generated_at: Rfc3339UtcTimestamp
  readonly run_counts_by_host: Readonly<Record<ExpressionHost, QueryHashVerifiedScalar<number>>>
  readonly overall_first_pass_qc_rate: QueryHashVerifiedScalar<number>
  readonly yield_distributions_by_class: ReadonlyArray<ConstructClassYieldDistribution>
  readonly top_deviation_categories: ReadonlyArray<{
    readonly category: string
    readonly count: QueryHashVerifiedScalar<number>
  }>
  readonly fab_reliability: {
    readonly deviations_per_100_runs: QueryHashVerifiedScalar<number>
    readonly share_absorbed_by_fab: QueryHashVerifiedScalar<number>
    readonly on_time_delivery_rate: QueryHashVerifiedScalar<number>
  }
  readonly promoted_protocols: ReadonlyArray<ProtocolVersionId>
  readonly open_change_proposals: ReadonlyArray<string>
}

export interface ReportingAgentShape {
  readonly token: AgentCapabilityToken<"reporting">

  readonly generateMonthlyClusterTechReport: (params: {
    readonly periodMonth: string
  }) => Effect.Effect<
    ClusterTechReport,
    CapabilityViolationError | AgentUnavailableError
  >
}

export class ReportingAgent extends Context.Tag(
  "prodqc-agent/ReportingAgent"
)<ReportingAgent, ReportingAgentShape>() {}

// ---------------------------------------------------------------------------
// 9. Learning / Meta Agent (§2.1, §5)
// ---------------------------------------------------------------------------

export interface CandidateEffectEvidenceBundle {
  readonly protocolFamily: ProtocolFamily
  readonly candidateProposal: ChangeProposal
  readonly supportingRunIds: ReadonlyArray<RunId>
  readonly observedPointEstimate: number
  readonly featureTableSnapshotHash: Sha256Hash
}

export interface LearningMetaAgentShape {
  readonly token: AgentCapabilityToken<"learning_meta">

  /**
   * Reads `Run`, `QCMeasurement`, `Deviation`, and `ProtocolVersion`; proposes
   * pre-registered `ChangeProposal`s with evidence bundles. Cannot promote (§2.1, §5).
   */
  readonly detectAndProposeChanges: (params: {
    readonly protocolFamily: ProtocolFamily
    readonly runs: ReadonlyArray<AgentSafeProjection<Run>>
    readonly qcMeasurements: ReadonlyArray<AgentSafeProjection<QCMeasurement>>
    readonly deviations: ReadonlyArray<AgentSafeProjection<Deviation>>
  }) => Effect.Effect<
    ReadonlyArray<CandidateEffectEvidenceBundle>,
    | CapabilityViolationError
    | PromptInjectionGuardError
    | SchemaValidationDeadLetterError
    | AgentUnavailableError
  >
}

export class LearningMetaAgent extends Context.Tag(
  "prodqc-agent/LearningMetaAgent"
)<LearningMetaAgent, LearningMetaAgentShape>() {}
