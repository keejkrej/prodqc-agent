import { Context, Effect } from "effect"
import type { WorkOrder } from "../agents/contracts.ts"
import type {
  InstrumentEventId,
  QCMeasurementId,
  Rfc3339UtcTimestamp,
  RunId,
  StepId
} from "../domain/ids.ts"
import type { InstrumentEvent, ParameterValue, QCMeasurement, ReleaseSpec } from "../domain/models.ts"

/**
 * Vendor-neutral microfluidic mixer port.
 * A real Precision NanoSystems / Unchained / in-house mixer adapter replaces the simulation Layer.
 */
export interface MixerMixParams {
  readonly workOrder: WorkOrder
  readonly stepId: StepId
  readonly eventId: InstrumentEventId
  readonly occurredAt: Rfc3339UtcTimestamp
  readonly recordedAt: Rfc3339UtcTimestamp
}

export interface MixerMixResult {
  readonly instrumentEvent: InstrumentEvent
  readonly actualParams: Readonly<Record<string, ParameterValue>>
}

export interface MicrofluidicMixerServiceShape {
  readonly vendorNeutralRole: "microfluidic_mixer"
  readonly mix: (params: MixerMixParams) => Effect.Effect<MixerMixResult>
}

export class MicrofluidicMixerService extends Context.Tag(
  "prodqc-agent/MicrofluidicMixerService"
)<MicrofluidicMixerService, MicrofluidicMixerServiceShape>() {}

/**
 * Vendor-neutral dynamic light scattering port.
 * A real Malvern / Wyatt / Nicomp adapter replaces the simulation Layer.
 */
export interface DlsScanParams {
  readonly workOrder: WorkOrder
  readonly runId: RunId
  readonly stepId: StepId
  readonly timepoint: "t0" | "t24h"
  readonly eventId: InstrumentEventId
  readonly zAverageMeasurementId: QCMeasurementId
  readonly pdiMeasurementId: QCMeasurementId | null
  readonly occurredAt: Rfc3339UtcTimestamp
  readonly recordedAt: Rfc3339UtcTimestamp
  readonly releaseSpec: ReleaseSpec
}

export interface DlsScanResult {
  readonly instrumentEvent: InstrumentEvent
  readonly zAverage: QCMeasurement
  readonly pdi: QCMeasurement | null
}

export interface DlsInstrumentServiceShape {
  readonly vendorNeutralRole: "dls"
  readonly scanSize: (params: DlsScanParams) => Effect.Effect<DlsScanResult>
}

export class DlsInstrumentService extends Context.Tag(
  "prodqc-agent/DlsInstrumentService"
)<DlsInstrumentService, DlsInstrumentServiceShape>() {}

/**
 * Vendor-neutral RiboGreen plate-reader port.
 * A real Thermo / Molecular Devices adapter replaces the simulation Layer.
 */
export interface RibogreenReadParams {
  readonly workOrder: WorkOrder
  readonly runId: RunId
  readonly stepId: StepId
  readonly eventId: InstrumentEventId
  readonly measurementId: QCMeasurementId
  readonly occurredAt: Rfc3339UtcTimestamp
  readonly recordedAt: Rfc3339UtcTimestamp
  readonly releaseSpec: ReleaseSpec
}

export interface RibogreenReadResult {
  readonly instrumentEvent: InstrumentEvent
  readonly encapsulationEfficiency: QCMeasurement
}

export interface RibogreenPlateReaderServiceShape {
  readonly vendorNeutralRole: "ribogreen_plate_reader"
  readonly measureEncapsulationEfficiency: (
    params: RibogreenReadParams
  ) => Effect.Effect<RibogreenReadResult>
}

export class RibogreenPlateReaderService extends Context.Tag(
  "prodqc-agent/RibogreenPlateReaderService"
)<RibogreenPlateReaderService, RibogreenPlateReaderServiceShape>() {}
