import { Context, Effect } from "effect"
import {
  CapabilityViolationError,
  DuplicateIdempotentActionError,
  PromptInjectionGuardError,
  SchemaValidationDeadLetterError
} from "../domain/errors.ts"
import {
  type AgentSafeProjection,
  HumanOnlyProseSymbol,
  type LabId,
  type UserId
} from "../domain/ids.ts"

/**
 * §2.1 & §7 Agent Capability Tokens, Table Allowlists & Prompt-Injection Containment
 *
 * Each agent process holds a scoped capability token that governs:
 * 1. Exact tables it may `SELECT` from
 * 2. Exact tables it may `INSERT` or `UPDATE` into (never `event_log` mutation!)
 * 3. Exact whitelisted tools it may invoke
 * 4. Automatic stripping/rejection of any `HumanOnlyProse` (`notes`, `rationale`) field
 */

export type AgentRole =
  | "orchestrator"
  | "intake_triage"
  | "planning_scheduling"
  | "protocol"
  | "execution_liaison"
  | "qc"
  | "lnp_formulation"
  | "reporting"
  | "learning_meta"

export type HumanRole =
  | "scientific_advisor"
  | "biosafety_reviewer"
  | "operator"
  | "lab_member"

export type SystemTable =
  | "request"
  | "design"
  | "construct"
  | "batch"
  | "run"
  | "step"
  | "instrument_event"
  | "qc_measurement"
  | "deviation"
  | "protocol_version"
  | "change_proposal"
  | "promotion_record"
  | "delivery"
  | "vial"
  | "event_log"
  | "capacity_calendar"
  | "release_spec"
  | "lipid_payload_inventory"
  | "tech_report"

export interface RolePermissionSpec {
  readonly readTables: ReadonlySet<SystemTable>
  readonly writeTables: ReadonlySet<SystemTable>
  readonly allowedTools: ReadonlySet<string>
}

/**
 * Canonical permission matrix encoded directly from §2.1 Agent Roles Table.
 */
export const AGENT_PERMISSION_MATRIX: Record<AgentRole, RolePermissionSpec> = {
  orchestrator: {
    readTables: new Set([
      "request",
      "design",
      "construct",
      "batch",
      "run",
      "step",
      "instrument_event",
      "qc_measurement",
      "deviation",
      "protocol_version",
      "delivery",
      "vial",
      "event_log"
    ]),
    writeTables: new Set(["request", "deviation", "event_log"]),
    allowedTools: new Set(["transition_request_state", "route_agent_task", "open_deviation"])
  },
  intake_triage: {
    readTables: new Set(["request", "design", "run", "construct"]),
    writeTables: new Set(["construct", "request"]),
    allowedTools: new Set([
      "run_biosafety_screen",
      "score_construct_feasibility",
      "propose_construct"
    ])
  },
  planning_scheduling: {
    readTables: new Set(["construct", "capacity_calendar", "batch", "run", "deviation"]),
    writeTables: new Set(["batch", "run", "request"]),
    allowedTools: new Set(["propose_batch_schedule", "commit_delivery_date", "allocate_rework_slot"])
  },
  protocol: {
    readTables: new Set(["protocol_version", "construct", "run"]),
    writeTables: new Set(["run"]),
    allowedTools: new Set(["select_protocol_version", "bind_protocol_parameters"])
  },
  execution_liaison: {
    readTables: new Set(["batch", "run", "step", "instrument_event", "protocol_version"]),
    writeTables: new Set(["step", "instrument_event", "deviation"]),
    allowedTools: new Set(["emit_work_order", "record_instrument_telemetry", "open_step_deviation"])
  },
  qc: {
    readTables: new Set(["qc_measurement", "release_spec", "run"]),
    writeTables: new Set(["qc_measurement", "run", "deviation"]),
    allowedTools: new Set(["evaluate_qc_set", "open_qc_deviation", "escalate_qc_to_human"])
  },
  lnp_formulation: {
    readTables: new Set([
      "lipid_payload_inventory",
      "protocol_version",
      "qc_measurement",
      "construct",
      "run"
    ]),
    writeTables: new Set(["run", "qc_measurement", "deviation"]),
    allowedTools: new Set([
      "check_lipid_inventory",
      "bind_lnp_formulation_protocol",
      "evaluate_lnp_qc"
    ])
  },
  reporting: {
    readTables: new Set([
      "event_log",
      "request",
      "batch",
      "run",
      "step",
      "qc_measurement",
      "deviation",
      "protocol_version",
      "change_proposal",
      "promotion_record",
      "delivery",
      "vial"
    ]),
    writeTables: new Set(["tech_report"]),
    allowedTools: new Set(["execute_verified_sql_view", "publish_tech_report"])
  },
  learning_meta: {
    // §2.1: "The learning agent, for instance, has SELECT on run data and INSERT on change_proposal only."
    readTables: new Set(["run", "qc_measurement", "deviation", "protocol_version"]),
    writeTables: new Set(["change_proposal"]),
    allowedTools: new Set(["detect_candidate_effect", "propose_protocol_change"])
  }
}

export interface AgentCapabilityToken<R extends AgentRole = AgentRole> {
  readonly _tag: "AgentCapabilityToken"
  readonly role: R
  readonly agentVersion: string
  readonly permissions: RolePermissionSpec
}

export interface HumanCapabilityToken<R extends HumanRole = HumanRole> {
  readonly _tag: "HumanCapabilityToken"
  readonly role: R
  readonly userId: UserId
  readonly labId?: LabId
  readonly activeBatchIds?: ReadonlyArray<string>
}

export const makeAgentCapabilityToken = <R extends AgentRole>(
  role: R,
  agentVersion: string
): AgentCapabilityToken<R> => ({
  _tag: "AgentCapabilityToken",
  role,
  agentVersion,
  permissions: AGENT_PERMISSION_MATRIX[role]
})

/**
 * Runtime & Structural Sanitizer (§3 & §7 Prompt-Injection Containment):
 * Recursively strips `notes`, `rationale`, and any `HumanOnlyProse` object from a record
 * before returning it to an Agent, and fails with `PromptInjectionGuardError` if an agent
 * prompt builder attempts to pass raw prose.
 */
export const stripProseForAgent = <T>(record: T): AgentSafeProjection<T> => {
  if (record === null || typeof record !== "object") {
    return record as AgentSafeProjection<T>
  }
  if (HumanOnlyProseSymbol in (record as Record<symbol, unknown>)) {
    return undefined as unknown as AgentSafeProjection<T>
  }
  if (Array.isArray(record)) {
    return record.map((item) => stripProseForAgent(item)) as unknown as AgentSafeProjection<T>
  }
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    if (key === "notes" || key === "rationale") {
      continue
    }
    if (
      value !== null &&
      typeof value === "object" &&
      HumanOnlyProseSymbol in (value as Record<symbol, unknown>)
    ) {
      continue
    }
    result[key] = stripProseForAgent(value)
  }
  return result as AgentSafeProjection<T>
}

export const assertNoProseInAgentInput = (
  agentRole: AgentRole,
  input: unknown,
  path = "root"
): Effect.Effect<void, PromptInjectionGuardError> =>
  Effect.suspend(() => {
    if (input === null || typeof input !== "object") {
      return Effect.void
    }
    if (HumanOnlyProseSymbol in (input as Record<symbol, unknown>)) {
      return Effect.fail(
        new PromptInjectionGuardError({
          agentRole,
          offendingFieldPath: path,
          message: "HumanOnlyProse value detected in agent input; prose is prohibited in agent context (§3, §7)."
        })
      )
    }
    if (Array.isArray(input)) {
      return Effect.forEach(
        input,
        (item, idx) => assertNoProseInAgentInput(agentRole, item, `${path}[${idx}]`),
        { discard: true }
      )
    }
    return Effect.forEach(
      Object.entries(input as Record<string, unknown>),
      ([key, value]) => {
        if (key === "notes" || key === "rationale") {
          return Effect.fail(
            new PromptInjectionGuardError({
              agentRole,
              offendingFieldPath: `${path}.${key}`,
              message: `Prose field '${key}' is prohibited in agent prompts (§3, §7).`
            })
          )
        }
        return assertNoProseInAgentInput(agentRole, value, `${path}.${key}`)
      },
      { discard: true }
    )
  })

/**
 * §7 Dead-Letter Queue Service for Agent Schema Validation Failures
 * "Any agent output that fails schema validation is dropped to a dead-letter queue
 * and surfaced to a human rather than coerced."
 */
export interface DeadLetterEntry {
  readonly id: string
  readonly agentRole: AgentRole
  readonly agentVersion: string
  readonly entityId: string
  readonly rawOutput: unknown
  readonly validationIssues: ReadonlyArray<string>
  readonly recordedAt: string
}

export interface DeadLetterQueueServiceShape {
  readonly enqueueInvalidAgentOutput: (
    entry: Omit<DeadLetterEntry, "id" | "recordedAt">
  ) => Effect.Effect<DeadLetterEntry>

  readonly listPendingForHumanReview: () => Effect.Effect<ReadonlyArray<DeadLetterEntry>>
}

export class DeadLetterQueueService extends Context.Tag(
  "prodqc-agent/DeadLetterQueueService"
)<DeadLetterQueueService, DeadLetterQueueServiceShape>() {}

/**
 * §2.1 & §7 Scoped Data-Access Layer Abstraction
 *
 * Enforces capability tokens on every read/write/tool call:
 * - Verifies `table` is in `token.permissions.readTables` or `writeTables`
 * - Automatically strips `notes`/`rationale` via `stripProseForAgent` on all reads
 * - Logs tool calls with `agentVersion` and `inputRecordIds`
 * - Enforces idempotency per `(entityId, eventCode)`
 */
export interface ScopedDataAccessServiceShape {
  readonly guardRead: <R extends AgentRole, A>(
    token: AgentCapabilityToken<R>,
    table: SystemTable,
    query: Effect.Effect<A, CapabilityViolationError>
  ) => Effect.Effect<AgentSafeProjection<A>, CapabilityViolationError>

  readonly guardWrite: <R extends AgentRole, A>(params: {
    readonly token: AgentCapabilityToken<R>
    readonly table: SystemTable
    readonly operation: "INSERT" | "UPDATE"
    readonly idempotencyKey: {
      readonly entityId: string
      readonly eventCode: string
    }
    readonly effect: Effect.Effect<A, CapabilityViolationError>
  }) => Effect.Effect<
    A,
    CapabilityViolationError | DuplicateIdempotentActionError
  >

  readonly guardToolCall: <R extends AgentRole, I, O>(params: {
    readonly token: AgentCapabilityToken<R>
    readonly toolName: string
    readonly entityId: string
    readonly inputRecordIds: ReadonlyArray<string>
    readonly input: I
    readonly validateOutput: (
      raw: unknown
    ) => Effect.Effect<O, ReadonlyArray<string>>
    readonly invoke: (sanitizedInput: AgentSafeProjection<I>) => Effect.Effect<unknown>
  }) => Effect.Effect<
    O,
    | CapabilityViolationError
    | PromptInjectionGuardError
    | SchemaValidationDeadLetterError
  >
}

export class ScopedDataAccessService extends Context.Tag(
  "prodqc-agent/ScopedDataAccessService"
)<ScopedDataAccessService, ScopedDataAccessServiceShape>() {}
