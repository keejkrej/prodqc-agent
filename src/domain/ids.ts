import { Brand, Schema } from "effect"

/**
 * §3 Structured Data Model — Branded Identifiers & Primitives
 *
 * Identifiers are ULIDs rendered with entity-specific prefixes (`req_01J...`, `dsg_01J...`).
 * Timestamps are RFC 3339 strings in canonical UTC; UI renders in `Europe/Berlin`.
 * Free-text fields (`notes`, `rationale`) are wrapped in `HumanOnlyProse` so that the
 * data-access layer and type system prevent prose from ever entering an agent prompt (§3, §7).
 */

export const RequestId = Schema.String.pipe(
  Schema.pattern(/^req_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("RequestId")
)
export type RequestId = typeof RequestId.Type

export const LabId = Schema.String.pipe(
  Schema.pattern(/^lab_[a-z0-9_]+$/i),
  Schema.brand("LabId")
)
export type LabId = typeof LabId.Type

export const UserId = Schema.String.pipe(
  Schema.pattern(/^user_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("UserId")
)
export type UserId = typeof UserId.Type

export const DesignId = Schema.String.pipe(
  Schema.pattern(/^dsg_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("DesignId")
)
export type DesignId = typeof DesignId.Type

export const ConstructId = Schema.String.pipe(
  Schema.pattern(/^cst_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("ConstructId")
)
export type ConstructId = typeof ConstructId.Type

export const BatchId = Schema.String.pipe(
  Schema.pattern(/^bat_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("BatchId")
)
export type BatchId = typeof BatchId.Type

export const RunId = Schema.String.pipe(
  Schema.pattern(/^run_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("RunId")
)
export type RunId = typeof RunId.Type

export const StepId = Schema.String.pipe(
  Schema.pattern(/^stp_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("StepId")
)
export type StepId = typeof StepId.Type

export const InstrumentEventId = Schema.String.pipe(
  Schema.pattern(/^iev_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("InstrumentEventId")
)
export type InstrumentEventId = typeof InstrumentEventId.Type

export const InstrumentId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.brand("InstrumentId")
)
export type InstrumentId = typeof InstrumentId.Type

export const QCMeasurementId = Schema.String.pipe(
  Schema.pattern(/^qcm_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("QCMeasurementId")
)
export type QCMeasurementId = typeof QCMeasurementId.Type

export const DeviationId = Schema.String.pipe(
  Schema.pattern(/^dev_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("DeviationId")
)
export type DeviationId = typeof DeviationId.Type

export const ProtocolVersionId = Schema.String.pipe(
  Schema.pattern(/^pv_[a-z0-9_]+_\d+\.\d+\.\d+$/i),
  Schema.brand("ProtocolVersionId")
)
export type ProtocolVersionId = typeof ProtocolVersionId.Type

export const ProtocolFamily = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9_]+$/i),
  Schema.brand("ProtocolFamily")
)
export type ProtocolFamily = typeof ProtocolFamily.Type

export const SemverString = Schema.String.pipe(
  Schema.pattern(/^\d+\.\d+\.\d+$/),
  Schema.brand("SemverString")
)
export type SemverString = typeof SemverString.Type

export const PromotionRecordId = Schema.String.pipe(
  Schema.pattern(/^prm_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("PromotionRecordId")
)
export type PromotionRecordId = typeof PromotionRecordId.Type

export const ChangeProposalId = Schema.String.pipe(
  Schema.pattern(/^chp_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("ChangeProposalId")
)
export type ChangeProposalId = typeof ChangeProposalId.Type

export const DeliveryId = Schema.String.pipe(
  Schema.pattern(/^del_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("DeliveryId")
)
export type DeliveryId = typeof DeliveryId.Type

export const VialId = Schema.String.pipe(
  Schema.pattern(/^vil_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("VialId")
)
export type VialId = typeof VialId.Type

export const ReleaseSpecId = Schema.String.pipe(
  Schema.pattern(/^spec_[0-9A-HJKMNP-TV-Z]{26}$/i),
  Schema.brand("ReleaseSpecId")
)
export type ReleaseSpecId = typeof ReleaseSpecId.Type

export const EventId = Schema.Number.pipe(
  Schema.int(),
  Schema.positive(),
  Schema.brand("EventId")
)
export type EventId = typeof EventId.Type

export const Sha256Hash = Schema.String.pipe(
  Schema.pattern(/^sha256:[a-f0-9]{64}$/i),
  Schema.brand("Sha256Hash")
)
export type Sha256Hash = typeof Sha256Hash.Type

export const Rfc3339UtcTimestamp = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
  Schema.brand("Rfc3339UtcTimestamp")
)
export type Rfc3339UtcTimestamp = typeof Rfc3339UtcTimestamp.Type

export const IsoCalendarDate = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.brand("IsoCalendarDate")
)
export type IsoCalendarDate = typeof IsoCalendarDate.Type

export const S3ObjectUri = Schema.String.pipe(
  Schema.pattern(/^s3:\/\/[a-z0-9.-]+\/.+$/i),
  Schema.brand("S3ObjectUri")
)
export type S3ObjectUri = typeof S3ObjectUri.Type

/**
 * §3 & §7 Prompt-Injection Containment:
 * Free text (`notes`, `rationale`) is wrapped in an opaque `HumanOnlyProse` value
 * whose `.toJSON()` and `.toString()` never leak raw text unless explicitly unwrapped
 * by a human-scoped view layer. Agent-facing projections strip all `HumanOnlyProse` fields.
 */
export const HumanOnlyProseSymbol: unique symbol = Symbol.for(
  "prodqc-agent/HumanOnlyProse"
)

export interface HumanOnlyProse extends Brand.Brand<"HumanOnlyProse"> {
  readonly [HumanOnlyProseSymbol]: true
  readonly __rawProseForHumanDisplayOnly: string
}

export const makeHumanOnlyProse = (raw: string): HumanOnlyProse =>
  ({
    [HumanOnlyProseSymbol]: true,
    __rawProseForHumanDisplayOnly: raw,
    toString: () => "[REDACTED_PROSE_EXCLUDED_FROM_AGENTS]",
    toJSON: () => "[REDACTED_PROSE_EXCLUDED_FROM_AGENTS]"
  }) as unknown as HumanOnlyProse

export const HumanOnlyProseSchema = Schema.transform(
  Schema.String,
  Schema.Unknown as Schema.Schema<HumanOnlyProse>,
  {
    strict: false,
    decode: (raw) => makeHumanOnlyProse(raw),
    encode: (prose) => prose.__rawProseForHumanDisplayOnly
  }
)

/**
 * Type-level recursive filter that strips `notes`, `rationale`, and any `HumanOnlyProse`
 * properties from a domain record before it can be passed into an Agent's input context.
 */
export type ProhibitedAgentKeys = "notes" | "rationale"

export type AgentSafeProjection<T> = T extends HumanOnlyProse
  ? never
  : T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<AgentSafeProjection<U>>
      : T extends object
        ? {
            readonly [K in keyof T as K extends ProhibitedAgentKeys
              ? never
              : T[K] extends HumanOnlyProse | undefined
                ? never
                : K]: AgentSafeProjection<T[K]>
          }
        : T
