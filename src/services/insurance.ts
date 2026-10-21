import { Context, Effect, Stream } from "effect"
import type { ReworkBufferExhaustedError } from "../domain/errors.ts"
import type {
  AgentSafeProjection,
  BatchId,
  InstrumentId,
  IsoCalendarDate,
  RequestId,
  Rfc3339UtcTimestamp,
  RunId
} from "../domain/ids.ts"
import type {
  CauseAttribution,
  Deviation,
  DeviationCategory,
  InstrumentEvent,
  ProtocolVersion,
  QCMeasurement,
  ReleaseSpec,
  Request,
  Run,
  Step
} from "../domain/models.ts"
import type { CapacityEnvelopeSlot } from "../agents/contracts.ts"

/**
 * §6 The Insurance Property Abstractions
 *
 * "A generic CRO passes failure back to the buyer as a delay or a re-order.
 * The fab absorbs fab-caused failure inside its committed date, and shows that it did."
 *
 * Three continuous detectors:
 * 1. Instrument watchdog — missing heartbeat or `severity = "error"` `InstrumentEvent`
 * 2. Step-level guard — `actual_params` outside `ProtocolVersion` bounds, or duration `> 2x` expected
 * 3. QC guard — out-of-spec `QCMeasurement` or batch pass rate below historical lower control limit (LCL)
 */

// ---------------------------------------------------------------------------
// 1. Declarative Cost Attribution Policy Table (§6)
// ---------------------------------------------------------------------------

export interface CostAttributionRule {
  readonly category: DeviationCategory
  readonly defaultAttribution: CauseAttribution
  readonly clientBearsCostWhenFabOrSupplier: false
  readonly clientBearsCostWhenClientDesign: true
  readonly description: string
}

/**
 * §6: "this boundary is published in the service terms and encoded in a single
 * `cost_attribution` policy table, not in agent judgement."
 */
export const COST_ATTRIBUTION_POLICY_TABLE: Readonly<
  Record<DeviationCategory, CostAttributionRule>
> = {
  instrument_failure: {
    category: "instrument_failure",
    defaultAttribution: "fab",
    clientBearsCostWhenFabOrSupplier: false,
    clientBearsCostWhenClientDesign: true,
    description: "Mechanical, fluidic, or telemetry failure of fab instrumentation."
  },
  contamination: {
    category: "contamination",
    defaultAttribution: "fab",
    clientBearsCostWhenFabOrSupplier: false,
    clientBearsCostWhenClientDesign: true,
    description: "Microbial, endotoxin, or cross-well contamination during execution."
  },
  operator_error: {
    category: "operator_error",
    defaultAttribution: "fab",
    clientBearsCostWhenFabOrSupplier: false,
    clientBearsCostWhenClientDesign: true,
    description: "Operator deviation from planned step parameters or timing."
  },
  material_shortage: {
    category: "material_shortage",
    defaultAttribution: "supplier",
    clientBearsCostWhenFabOrSupplier: false,
    clientBearsCostWhenClientDesign: true,
    description: "Reagent, resin, media, or lipid lot stockout/defect from upstream supplier."
  },
  low_yield: {
    category: "low_yield",
    defaultAttribution: "unknown",
    clientBearsCostWhenFabOrSupplier: false,
    clientBearsCostWhenClientDesign: true,
    description: "Yield below requested amount; attributed to fab unless structured evidence proves insoluble/toxic design."
  },
  qc_fail: {
    category: "qc_fail",
    defaultAttribution: "fab",
    clientBearsCostWhenFabOrSupplier: false,
    clientBearsCostWhenClientDesign: true,
    description: "Out-of-spec QC measurement;canary failures are always absorbed at fab cost (§5)."
  },
  shipping: {
    category: "shipping",
    defaultAttribution: "fab",
    clientBearsCostWhenFabOrSupplier: false,
    clientBearsCostWhenClientDesign: true,
    description: "Cold-chain excursion or courier delay during intra-cluster handoff."
  }
}

export const computeClientBearsCost = (params: {
  readonly attribution: CauseAttribution
  readonly isCanaryArm: boolean
}): boolean => {
  // §5: "any canary run that fails QC is re-run at fab cost under the insurance property (§6)"
  if (params.isCanaryArm) {
    return false
  }
  if (params.attribution === "fab" || params.attribution === "supplier") {
    return false
  }
  return params.attribution === "client_design"
}

// ---------------------------------------------------------------------------
// 2. Continuous Anomaly Detectors (§6 Detection)
// ---------------------------------------------------------------------------

export interface InstrumentWatchdogConfig {
  readonly maxHeartbeatSilenceSeconds: number
}

export interface StepLevelGuardConfig {
  /**
   * §6: "a step exceeding its expected duration by 2x [ASSUMPTION]"
   */
  readonly maxDurationMultiplier: number // Default 2.0
}

export interface QCGuardConfig {
  readonly batchHistoricalLowerControlLimit: number // e.g. 0.80 first-pass rate
}

export type DetectedAnomaly =
  | {
      readonly _tag: "InstrumentWatchdogTrigger"
      readonly instrumentId: InstrumentId
      readonly reason: "missing_heartbeat" | "severity_error_event"
      readonly triggeringEvent?: AgentSafeProjection<InstrumentEvent>
      readonly detectedAt: Rfc3339UtcTimestamp
    }
  | {
      readonly _tag: "StepGuardTrigger"
      readonly runId: RunId
      readonly step: AgentSafeProjection<Step>
      readonly reason: "params_out_of_bounds" | "duration_exceeded_2x"
      readonly details: string
      readonly detectedAt: Rfc3339UtcTimestamp
    }
  | {
      readonly _tag: "QCGuardTrigger"
      readonly scopeType: "run" | "batch"
      readonly scopeId: RunId | BatchId
      readonly reason: "measurement_out_of_spec" | "batch_pass_rate_below_lcl"
      readonly failedMeasurements: ReadonlyArray<AgentSafeProjection<QCMeasurement>>
      readonly detectedAt: Rfc3339UtcTimestamp
    }

export type InsuranceAbsorptionOutcome =
  | {
      readonly _tag: "AbsorbedAndRescheduledInBuffer"
      readonly deviation: Deviation
      readonly rescheduledRun: Run
      readonly newBatchId: BatchId
      readonly committedDeliveryDateHeld: true
      readonly clientBearsCost: false
    }
  | {
      readonly _tag: "EscalatedToHumanWithLabOptions"
      readonly deviation: Deviation
      readonly committedDeliveryDate: IsoCalendarDate
      readonly clientBearsCost: false
      readonly proposedLabOptions: ReadonlyArray<
        "partial_release" | "new_date" | "cancel_no_charge"
      >
    }
  | {
      readonly _tag: "ClientDesignStructuredEvidenceReported"
      readonly deviation: Deviation
      readonly clientBearsCost: true
      readonly structuredEvidenceMeasurementIds: ReadonlyArray<string>
    }

export interface InsurancePropertyServiceShape {
  readonly stepGuardConfig: StepLevelGuardConfig

  /**
   * Detector (a): Continuous stream monitoring instrument heartbeats & `severity = "error"` events.
   */
  readonly monitorInstrumentWatchdog: (
    events: Stream.Stream<AgentSafeProjection<InstrumentEvent>>,
    config: InstrumentWatchdogConfig
  ) => Stream.Stream<DetectedAnomaly>

  /**
   * Detector (b): Checks step actuals against `ProtocolVersion` bounds and `2x` expected duration.
   */
  readonly checkStepLevelGuard: (params: {
    readonly step: AgentSafeProjection<Step>
    readonly protocolVersion: AgentSafeProjection<ProtocolVersion>
    readonly checkedAt: Rfc3339UtcTimestamp
  }) => Effect.Effect<ReadonlyArray<DetectedAnomaly>>

  /**
   * Detector (c): Checks run QC measurements against `ReleaseSpec` and batch pass rate against LCL.
   */
  readonly checkQCGuard: (params: {
    readonly run: AgentSafeProjection<Run>
    readonly measurements: ReadonlyArray<AgentSafeProjection<QCMeasurement>>
    readonly releaseSpec: AgentSafeProjection<ReleaseSpec>
    readonly batchFirstPassRate?: number
    readonly qcConfig: QCGuardConfig
    readonly checkedAt: Rfc3339UtcTimestamp
  }) => Effect.Effect<ReadonlyArray<DetectedAnomaly>>

  /**
   * §6 Absorption:
   * Opens a `Deviation`, computes `cause_attribution` via `COST_ATTRIBUTION_POLICY_TABLE`,
   * sets `client_bears_cost`, and either reschedules into the 15% batch rework buffer,
   * escalates to human with lab options if buffer is exhausted, or reports structured client-design evidence.
   */
  readonly openAndAbsorbDeviation: (params: {
    readonly request: AgentSafeProjection<Request>
    readonly failedRun: AgentSafeProjection<Run>
    readonly category: DeviationCategory
    readonly evidenceAttributionOverride?: CauseAttribution
    readonly capacityCalendar: ReadonlyArray<CapacityEnvelopeSlot>
    readonly openedAt: Rfc3339UtcTimestamp
  }) => Effect.Effect<InsuranceAbsorptionOutcome, ReworkBufferExhaustedError>
}

export class InsurancePropertyService extends Context.Tag(
  "prodqc-agent/InsurancePropertyService"
)<InsurancePropertyService, InsurancePropertyServiceShape>() {}
