import { Context, Effect } from "effect"
import {
  type InvalidStateTransitionError,
  ProtocolBoundsViolationError,
  ProtocolPromotionError
} from "../domain/errors.ts"
import type {
  AgentSafeProjection,
  BatchId,
  ChangeProposalId,
  HumanOnlyProse,
  LabId,
  PromotionRecordId,
  ProtocolFamily,
  ProtocolVersionId,
  Rfc3339UtcTimestamp,
  RunId,
  SemverString,
  Sha256Hash
} from "../domain/ids.ts"
import type {
  AssignmentArm,
  ChangeProposal,
  ConstructClassKey,
  GuardrailEvaluationResult,
  ParameterValue,
  PromotionRecord,
  ProtocolVersion,
  QCMeasurement,
  Run
} from "../domain/models.ts"
import type { HumanCapabilityToken } from "../security/capabilities.ts"

/**
 * §1 P2 & §5 Self-Improvement Loop Abstractions
 *
 * Enforces falsification tests T2.1, T2.2, T2.3:
 * - Pre-registration of `ChangeProposal` before any canary data is collected.
 * - Stratified randomization (`canary <= 20%` of eligible runs across labs & batches).
 * - Mixed-effects statistical evaluation (`metric ~ arm + (1|lab_id) + (1|batch_id) + construct_class`)
 *   and generalization check (`>= 2 labs`, `>= 3 batches`, `>= 12 runs/arm`, sign consistency).
 * - Human sign-off gate: ONLY `HumanCapabilityToken<"scientific_advisor">` can transition
 *   `shadow -> canary` and `canary -> default` (T2.2).
 * - Deterministic replay (`T2.3`) of `PromotionRecord` from stored `Run` / `QCMeasurement` rows.
 * - Automatic 30-day post-promotion rollback if first-pass QC rate drops by `> 2 SE` (§5).
 */

export type SemverBumpType = "PATCH" | "MINOR" | "MAJOR"

export interface StepDiffEntry {
  readonly stepKey: string
  readonly changeType: "added" | "removed" | "reordered" | "params_modified" | "unchanged"
  readonly fromOrdinal?: number
  readonly toOrdinal?: number
  readonly paramDiffs: ReadonlyArray<{
    readonly paramName: string
    readonly fromSpec?: unknown
    readonly toSpec?: unknown
  }>
}

export interface ProtocolVersionDiff {
  readonly family: ProtocolFamily
  readonly fromVersion: ProtocolVersionId
  readonly toVersion: ProtocolVersionId
  readonly inferredSemverBump: SemverBumpType
  readonly applicabilityNarrowed: boolean
  readonly stepDiffs: ReadonlyArray<StepDiffEntry>
}

export interface PerLabArmBreakdown {
  readonly labId: LabId
  readonly defaultArmRuns: number
  readonly canaryArmRuns: number
  readonly pointEstimateDelta: number
  readonly consistentWithExpectedDirection: boolean
}

export interface StatisticalEvaluationResult {
  readonly proposalId: ChangeProposalId
  readonly effectEstimate: number
  readonly ci95: readonly [number, number]
  readonly pValue: number
  readonly nRunsTotal: number
  readonly nRunsDefaultArm: number
  readonly nRunsCanaryArm: number
  readonly nDistinctLabs: number
  readonly nDistinctBatches: number
  readonly perLabBreakdowns: ReadonlyArray<PerLabArmBreakdown>
  readonly guardrailResults: ReadonlyArray<GuardrailEvaluationResult>
  readonly acceptanceRulePassed: boolean
  readonly generalizationRulePassed: boolean
  readonly queryHash: Sha256Hash
}

export interface RunAnalysisRow {
  readonly run: AgentSafeProjection<Run>
  readonly labId: LabId
  readonly batchId: BatchId
  readonly constructClass: ConstructClassKey
  readonly measurements: ReadonlyArray<AgentSafeProjection<QCMeasurement>>
}

/**
 * Pure validator for parameter bindings against a `ProtocolVersion`'s declared step schemas (§7).
 */
export const validateParameterBindingsAgainstProtocol = (
  protocol: AgentSafeProjection<ProtocolVersion>,
  stepKey: string,
  bindings: Readonly<Record<string, ParameterValue>>
): Effect.Effect<
  Readonly<Record<string, ParameterValue>>,
  ProtocolBoundsViolationError
> =>
  Effect.gen(function* () {
    const stepDef = protocol.steps.find((s) => s.key === stepKey)
    if (!stepDef) {
      return yield* Effect.fail(
        new ProtocolBoundsViolationError({
          protocolVersionId: protocol.id,
          stepKey,
          parameterName: "<step>",
          attemptedValue: stepKey,
          allowedRange: {}
        })
      )
    }

    for (const [paramName, value] of Object.entries(bindings)) {
      const boundSpec = stepDef.params_schema[paramName]
      if (!boundSpec) {
        return yield* Effect.fail(
          new ProtocolBoundsViolationError({
            protocolVersionId: protocol.id,
            stepKey,
            parameterName: paramName,
            attemptedValue: value,
            allowedRange: {}
          })
        )
      }
      if (typeof value !== boundSpec.type) {
        return yield* Effect.fail(
          new ProtocolBoundsViolationError({
            protocolVersionId: protocol.id,
            stepKey,
            parameterName: paramName,
            attemptedValue: value,
            allowedRange: {
              ...(boundSpec.min !== undefined ? { min: boundSpec.min } : {}),
              ...(boundSpec.max !== undefined ? { max: boundSpec.max } : {})
            }
          })
        )
      }
      if (typeof value === "number") {
        if (
          (boundSpec.min !== undefined && value < boundSpec.min) ||
          (boundSpec.max !== undefined && value > boundSpec.max)
        ) {
          return yield* Effect.fail(
            new ProtocolBoundsViolationError({
              protocolVersionId: protocol.id,
              stepKey,
              parameterName: paramName,
              attemptedValue: value,
              allowedRange: {
                ...(boundSpec.min !== undefined ? { min: boundSpec.min } : {}),
                ...(boundSpec.max !== undefined ? { max: boundSpec.max } : {})
              }
            })
          )
        }
      }
      if (
        boundSpec.allowed_values !== undefined &&
        !boundSpec.allowed_values.includes(value)
      ) {
        return yield* Effect.fail(
          new ProtocolBoundsViolationError({
            protocolVersionId: protocol.id,
            stepKey,
            parameterName: paramName,
            attemptedValue: value,
            allowedRange: {}
          })
        )
      }
    }

    return bindings
  })

/**
 * §5 Statistical Acceptance & Deterministic Replay Engine (T2.1, T2.3)
 */
export interface StatisticalAcceptanceEngineShape {
  /**
   * Evaluates a pre-registered `ChangeProposal` against collected canary & default runs.
   */
  readonly evaluateProposal: (params: {
    readonly proposal: AgentSafeProjection<ChangeProposal>
    readonly rows: ReadonlyArray<RunAnalysisRow>
  }) => Effect.Effect<StatisticalEvaluationResult, ProtocolPromotionError>

  /**
   * T2.3 Falsification Check:
   * Replays a stored `PromotionRecord` decision from the historical `Run`/`QCMeasurement` rows
   * and verifies that the reproduced `effect_estimate` matches `record.effect_estimate`
   * within `numericalTolerance` (e.g. `1e-6`).
   */
  readonly replayAndVerifyPromotion: (params: {
    readonly promotionRecord: AgentSafeProjection<PromotionRecord>
    readonly proposal: AgentSafeProjection<ChangeProposal>
    readonly rows: ReadonlyArray<RunAnalysisRow>
    readonly numericalTolerance?: number
  }) => Effect.Effect<
    {
      readonly promotionRecordId: PromotionRecordId
      readonly storedEstimate: number
      readonly reproducedEstimate: number
      readonly absoluteDifference: number
      readonly withinTolerance: true
    },
    ProtocolPromotionError
  >
}

export class StatisticalAcceptanceEngine extends Context.Tag(
  "prodqc-agent/StatisticalAcceptanceEngine"
)<StatisticalAcceptanceEngine, StatisticalAcceptanceEngineShape>() {}

/**
 * §5 ProtocolVersion Registry, Canary Assignment & Auto-Rollback Service
 */
export interface ProtocolRegistryServiceShape {
  readonly maxCanaryFraction: number // Default 0.20 (<= 20% of eligible runs [ASSUMPTION])
  readonly postPromotionMonitorDays: number // Default 30 days
  readonly rollbackStandardErrorThreshold: number // Default 2.0 SE [ASSUMPTION]

  readonly getDefaultVersion: (
    family: ProtocolFamily
  ) => Effect.Effect<ProtocolVersion, ProtocolPromotionError>

  readonly listFamilyVersions: (
    family: ProtocolFamily
  ) => Effect.Effect<ReadonlyArray<ProtocolVersion>>

  readonly diffVersions: (params: {
    readonly family: ProtocolFamily
    readonly fromSemver: SemverString
    readonly toSemver: SemverString
  }) => Effect.Effect<ProtocolVersionDiff, ProtocolPromotionError>

  /**
   * Stratified randomization for canary assignment (§5):
   * Stratified by `(labId, batchId)` and strictly capped at `maxCanaryFraction` (`<= 20%`).
   */
  readonly assignRunArmStratified: (params: {
    readonly family: ProtocolFamily
    readonly labId: LabId
    readonly batchId: BatchId
    readonly currentEligibleRunsInStratum: number
    readonly currentCanaryRunsInStratum: number
  }) => Effect.Effect<
    {
      readonly arm: AssignmentArm
      readonly protocolVersionId: ProtocolVersionId
    },
    ProtocolPromotionError
  >

  /**
   * §5 Human-in-the-loop transition `shadow -> canary`:
   * Requires `HumanCapabilityToken<"scientific_advisor">` and a pre-registered `ChangeProposal`.
   */
  readonly authorizeCanaryRollout: (params: {
    readonly advisorToken: HumanCapabilityToken<"scientific_advisor">
    readonly proposal: ChangeProposal
    readonly candidateVersionId: ProtocolVersionId
    readonly rationale: HumanOnlyProse
    readonly signedAt: Rfc3339UtcTimestamp
  }) => Effect.Effect<
    ProtocolVersion,
    ProtocolPromotionError | InvalidStateTransitionError
  >

  /**
   * §5 & T2.1 / T2.2 Human-in-the-loop promotion `canary -> default`:
   * Requires:
   * 1. `HumanCapabilityToken<"scientific_advisor">` (T2.2)
   * 2. Passing `StatisticalEvaluationResult` (both acceptance rule and generalization rule hold)
   * 3. Creates immutable `PromotionRecord` and bumps `default` pointer (T2.1)
   */
  readonly promoteCanaryToDefault: (params: {
    readonly advisorToken: HumanCapabilityToken<"scientific_advisor">
    readonly proposal: ChangeProposal
    readonly fromVersionId: ProtocolVersionId
    readonly toVersionId: ProtocolVersionId
    readonly evaluation: StatisticalEvaluationResult
    readonly rationale: HumanOnlyProse
    readonly signedAt: Rfc3339UtcTimestamp
  }) => Effect.Effect<
    {
      readonly promotedVersion: ProtocolVersion
      readonly promotionRecord: PromotionRecord
    },
    ProtocolPromotionError | InvalidStateTransitionError
  >

  /**
   * §5 Post-promotion automatic rollback guard:
   * Demotes to `parent_version` and emits `protocol.rolled_back` event if in the 30 days
   * after promotion, the first-pass QC rate drops below its pre-promotion value by `> 2 SE`.
   */
  readonly evaluatePostPromotionRollbackGuard: (params: {
    readonly activeDefaultVersion: ProtocolVersion
    readonly baselineFirstPassQcRate: number
    readonly baselineStandardError: number
    readonly postPromotionFirstPassQcRate: number
    readonly evaluatedAt: Rfc3339UtcTimestamp
  }) => Effect.Effect<
    | { readonly action: "retain_default"; readonly qcDropSe: number }
    | {
        readonly action: "auto_rolled_back"
        readonly demotedVersionId: ProtocolVersionId
        readonly restoredParentVersionId: ProtocolVersionId
        readonly qcDropSe: number
      },
    ProtocolPromotionError
  >
}

export class ProtocolRegistryService extends Context.Tag(
  "prodqc-agent/ProtocolRegistryService"
)<ProtocolRegistryService, ProtocolRegistryServiceShape>() {}
