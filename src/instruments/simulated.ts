import { Effect, Layer } from "effect"
import type { InstrumentId, S3ObjectUri } from "../domain/ids.ts"
import { InstrumentEvent, QCMeasurement, type QCVerdict } from "../domain/models.ts"
import type { LnpDraftProtocol } from "../protocol/lnp-draft.ts"
import {
  DlsInstrumentService,
  type DlsInstrumentServiceShape,
  type DlsScanParams,
  MicrofluidicMixerService,
  type MicrofluidicMixerServiceShape,
  type MixerMixParams,
  RibogreenPlateReaderService,
  type RibogreenPlateReaderServiceShape,
  type RibogreenReadParams
} from "./contracts.ts"

export const SIMULATED_MIXER_INSTRUMENT_ID = "sim_microfluidic_mixer" as InstrumentId
export const SIMULATED_DLS_INSTRUMENT_ID = "sim_dls" as InstrumentId
export const SIMULATED_RIBOGREEN_INSTRUMENT_ID =
  "sim_ribogreen_plate_reader" as InstrumentId

const simulatedUri = (name: string): S3ObjectUri =>
  `s3://simulated-prodqc/lnp-demo/${name}` as S3ObjectUri

const maxSpecVerdict = (value: number, specMax: number | null): QCVerdict =>
  specMax === null || value <= specMax ? "pass" : "fail"

const minSpecVerdict = (value: number, specMin: number | null): QCVerdict =>
  specMin === null || value >= specMin ? "pass" : "fail"

const rangeSpecVerdict = (
  value: number,
  range: readonly [number, number] | null
): QCVerdict =>
  range === null || (value >= range[0] && value <= range[1]) ? "pass" : "fail"

export const makeSimulatedMixer = (
  protocol: LnpDraftProtocol
): MicrofluidicMixerServiceShape => ({
  vendorNeutralRole: "microfluidic_mixer",
  mix: (params: MixerMixParams) =>
    Effect.sync(() => {
      const mixer = protocol.simulation.mixer
      const actualParams = {
        simulated: true,
        total_flow_rate_ml_min: mixer.total_flow_rate_ml_min,
        flow_rate_ratio_aqueous_to_organic: mixer.flow_rate_ratio_aqueous_to_organic,
        temperature_c: mixer.temperature_c,
        n_p_ratio: protocol.formulation.n_p_ratio
      } as const
      return {
        actualParams,
        instrumentEvent: new InstrumentEvent({
          id: params.eventId,
          step_id: params.stepId,
          instrument_id: SIMULATED_MIXER_INSTRUMENT_ID,
          event_type: "end",
          payload: { ...actualParams },
          severity: "info",
          occurred_at: params.occurredAt,
          recorded_at: params.recordedAt
        })
      }
    })
})

export const makeSimulatedDls = (protocol: LnpDraftProtocol): DlsInstrumentServiceShape => ({
  vendorNeutralRole: "dls",
  scanSize: (params: DlsScanParams) =>
    Effect.sync(() => {
      const zAvg =
        params.timepoint === "t0"
          ? protocol.simulation.dls_t0.z_avg_nm
          : protocol.simulation.dls_t24h.z_avg_nm
      const pdi = params.timepoint === "t0" ? protocol.simulation.dls_t0.pdi : null
      const zRange = params.releaseSpec.dls_z_avg_nm_range
      const payload: Record<string, string | number | boolean> = {
        simulated: true,
        timepoint: params.timepoint,
        z_avg_nm: zAvg
      }
      if (pdi !== null) {
        payload["pdi"] = pdi
      }
      const zAverage = new QCMeasurement({
        id: params.zAverageMeasurementId,
        run_id: params.runId,
        assay: "dls_size",
        metric: "z_avg_nm",
        value: zAvg,
        unit: "nm",
        instrument_id: SIMULATED_DLS_INSTRUMENT_ID,
        raw_file_uri: simulatedUri(`dls-${params.timepoint}-zavg.json`),
        spec_min: zRange === null ? null : zRange[0],
        spec_max: zRange === null ? null : zRange[1],
        verdict: rangeSpecVerdict(zAvg, zRange),
        measured_at: params.occurredAt
      })
      const pdiMeasurement =
        pdi === null || params.pdiMeasurementId === null
          ? null
          : new QCMeasurement({
              id: params.pdiMeasurementId,
              run_id: params.runId,
              assay: "dls_pdi",
              metric: "pdi",
              value: pdi,
              unit: "dimensionless",
              instrument_id: SIMULATED_DLS_INSTRUMENT_ID,
              raw_file_uri: simulatedUri(`dls-${params.timepoint}-pdi.json`),
              spec_min: null,
              spec_max: params.releaseSpec.dls_pdi_max,
              verdict: maxSpecVerdict(pdi, params.releaseSpec.dls_pdi_max),
              measured_at: params.occurredAt
            })
      return {
        zAverage,
        pdi: pdiMeasurement,
        instrumentEvent: new InstrumentEvent({
          id: params.eventId,
          step_id: params.stepId,
          instrument_id: SIMULATED_DLS_INSTRUMENT_ID,
          event_type: "reading",
          payload,
          severity: "info",
          occurred_at: params.occurredAt,
          recorded_at: params.recordedAt
        })
      }
    })
})

export const makeSimulatedRibogreen = (
  protocol: LnpDraftProtocol
): RibogreenPlateReaderServiceShape => ({
  vendorNeutralRole: "ribogreen_plate_reader",
  measureEncapsulationEfficiency: (params: RibogreenReadParams) =>
    Effect.sync(() => {
      const eePct = protocol.simulation.ribogreen.ee_pct
      return {
        encapsulationEfficiency: new QCMeasurement({
          id: params.measurementId,
          run_id: params.runId,
          assay: "ribogreen_ee",
          metric: "ee_pct",
          value: eePct,
          unit: "percent",
          instrument_id: SIMULATED_RIBOGREEN_INSTRUMENT_ID,
          raw_file_uri: simulatedUri("ribogreen-ee.json"),
          spec_min: params.releaseSpec.ribogreen_ee_pct_min,
          spec_max: null,
          verdict: minSpecVerdict(eePct, params.releaseSpec.ribogreen_ee_pct_min),
          measured_at: params.occurredAt
        }),
        instrumentEvent: new InstrumentEvent({
          id: params.eventId,
          step_id: params.stepId,
          instrument_id: SIMULATED_RIBOGREEN_INSTRUMENT_ID,
          event_type: "reading",
          payload: { simulated: true, ee_pct: eePct },
          severity: "info",
          occurred_at: params.occurredAt,
          recorded_at: params.recordedAt
        })
      }
    })
})

export const makeSimulatedInstrumentLayers = (protocol: LnpDraftProtocol) =>
  Layer.mergeAll(
    Layer.succeed(MicrofluidicMixerService, makeSimulatedMixer(protocol)),
    Layer.succeed(DlsInstrumentService, makeSimulatedDls(protocol)),
    Layer.succeed(RibogreenPlateReaderService, makeSimulatedRibogreen(protocol))
  )
