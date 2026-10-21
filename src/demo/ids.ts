import type {
  BatchId,
  ConstructId,
  DesignId,
  InstrumentEventId,
  QCMeasurementId,
  ReleaseSpecId,
  RequestId,
  RunId,
  StepId,
  UserId
} from "../domain/ids.ts"

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/i

export const padCrockford26 = (seed: string): string => {
  const cleaned = seed
    .toUpperCase()
    .replace(/[ILOU]/g, "X")
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, "0")
  return cleaned.slice(0, 26).padEnd(26, "0")
}

export type DemoLane = "SCRN" | "NVVX"

export interface DemoEntityIds {
  readonly lane: DemoLane
  readonly requestId: RequestId
  readonly operatorId: UserId
  readonly designId: DesignId
  readonly constructId: ConstructId
  readonly batchId: BatchId
  readonly runId: RunId
  readonly releaseSpecId: ReleaseSpecId
  readonly mixStepId: StepId
  readonly dlsT0StepId: StepId
  readonly ribogreenStepId: StepId
  readonly dlsT24hStepId: StepId
  readonly mixEventId: InstrumentEventId
  readonly dlsT0EventId: InstrumentEventId
  readonly ribogreenEventId: InstrumentEventId
  readonly dlsT24hEventId: InstrumentEventId
  readonly zAvgT0MeasurementId: QCMeasurementId
  readonly pdiMeasurementId: QCMeasurementId
  readonly eeMeasurementId: QCMeasurementId
  readonly zAvgT24hMeasurementId: QCMeasurementId
  readonly workOrderId: string
}

const branded = <T extends string>(prefix: string, body: string): T => {
  const id = `${prefix}${body}`
  if (prefix !== "lab_" && !CROCKFORD.test(body)) {
    throw new Error(`Invalid Crockford body for demo id ${id}`)
  }
  return id as T
}

export const makeDemoEntityIds = (lane: DemoLane): DemoEntityIds => {
  const body = (suffix: string) => padCrockford26(`${lane}${suffix}`)
  const shared = padCrockford26(lane)
  return {
    lane,
    requestId: branded("req_", shared),
    operatorId: branded("user_", "01JAW9X8K2M3N4P5Q6R7S8T9V1"),
    designId: branded("dsg_", body("DSG")),
    constructId: branded("cst_", body("CST")),
    batchId: branded("bat_", shared),
    runId: branded("run_", shared),
    releaseSpecId: branded("spec_", body("SPC")),
    mixStepId: branded("stp_", body("MX0")),
    dlsT0StepId: branded("stp_", body("DT0")),
    ribogreenStepId: branded("stp_", body("RBN")),
    dlsT24hStepId: branded("stp_", body("D24")),
    mixEventId: branded("iev_", body("M0E")),
    dlsT0EventId: branded("iev_", body("D0R")),
    ribogreenEventId: branded("iev_", body("RBR")),
    dlsT24hEventId: branded("iev_", body("D1R")),
    zAvgT0MeasurementId: branded("qcm_", body("QZ0")),
    pdiMeasurementId: branded("qcm_", body("QPD")),
    eeMeasurementId: branded("qcm_", body("QEE")),
    zAvgT24hMeasurementId: branded("qcm_", body("QZ1")),
    workOrderId: `wo_sim_lnp_${lane.toLowerCase()}`
  }
}
