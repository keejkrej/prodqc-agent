import { readFile } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import type { IsoCalendarDate, ReleaseSpecId, Rfc3339UtcTimestamp } from "../domain/ids.ts"
import {
  LnpQcDispositionAction,
  ProductLine,
  ProtocolStatus,
  ProtocolVersion,
  QCAssay,
  QCMetric,
  QCUnit,
  ReleaseSpec
} from "../domain/models.ts"

/**
 * DRAFT first-pass LNP protocol document.
 * Validated with Effect Schema. Replace later with a registered ProtocolVersion.
 */
export const DEFAULT_LNP_DRAFT_PROTOCOL_PATH = "protocols/lnp-microfluidic-mixing.draft.json"

const SimulatedFlag = Schema.Literal(true)

const NumberBound = Schema.Struct({
  type: Schema.Literal("number"),
  min: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number)
})

export class LnpDraftMaterial extends Schema.Class<LnpDraftMaterial>("LnpDraftMaterial")({
  id: Schema.String.pipe(Schema.minLength(1)),
  role: Schema.String.pipe(Schema.minLength(1)),
  name: Schema.String.pipe(Schema.minLength(1)),
  lot_number: Schema.String.pipe(Schema.minLength(1)),
  available_mg: Schema.Number.pipe(Schema.positive()),
  expires_at: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/)),
  simulated: SimulatedFlag
}) {}

export class LnpDraftFormulation extends Schema.Class<LnpDraftFormulation>(
  "LnpDraftFormulation"
)({
  simulated: SimulatedFlag,
  n_p_ratio: Schema.Number.pipe(Schema.positive()),
  total_flow_rate_ml_min: Schema.Number.pipe(Schema.positive()),
  flow_rate_ratio_aqueous_to_organic: Schema.Number.pipe(Schema.positive()),
  lipid_molar_percent: Schema.Record({ key: Schema.String, value: Schema.Number })
}) {}

export class LnpDraftProcessStep extends Schema.Class<LnpDraftProcessStep>(
  "LnpDraftProcessStep"
)({
  key: Schema.String.pipe(Schema.minLength(1)),
  ordinal: Schema.Number.pipe(Schema.int(), Schema.positive()),
  instrument_role: Schema.Literal(
    "microfluidic_mixer",
    "dls",
    "ribogreen_plate_reader",
    "none"
  ),
  expected_duration_minutes: Schema.Number.pipe(Schema.positive()),
  params: Schema.Record({ key: Schema.String, value: NumberBound })
}) {}

export class LnpDraftQcAssay extends Schema.Class<LnpDraftQcAssay>("LnpDraftQcAssay")({
  assay: QCAssay,
  metric: QCMetric,
  timepoint: Schema.Literal("t0", "t24h"),
  unit: QCUnit
}) {}

export class LnpDraftBorderlineBands extends Schema.Class<LnpDraftBorderlineBands>(
  "LnpDraftBorderlineBands"
)({
  dls_pdi_max: Schema.Number.pipe(Schema.positive()),
  ribogreen_ee_pct_min: Schema.Number.pipe(Schema.between(0, 100)),
  size_drift_nm_max: Schema.Number.pipe(Schema.nonNegative())
}) {}

export class LnpDraftReleaseSpecs extends Schema.Class<LnpDraftReleaseSpecs>(
  "LnpDraftReleaseSpecs"
)({
  dls_z_avg_nm_range: Schema.Tuple(Schema.Number, Schema.Number),
  dls_pdi_max: Schema.Number.pipe(Schema.positive()),
  ribogreen_ee_pct_min: Schema.Number.pipe(Schema.between(0, 100)),
  size_drift_nm_max: Schema.Number.pipe(Schema.nonNegative()),
  borderline_bands: LnpDraftBorderlineBands
}) {}

export class LnpDraftDispositionMapping extends Schema.Class<LnpDraftDispositionMapping>(
  "LnpDraftDispositionMapping"
)({
  in_spec: LnpQcDispositionAction,
  borderline: LnpQcDispositionAction,
  hard_fail: LnpQcDispositionAction
}) {}

export class LnpDraftQcDisposition extends Schema.Class<LnpDraftQcDisposition>(
  "LnpDraftQcDisposition"
)({
  rule_id: Schema.String.pipe(Schema.minLength(1)),
  simulated: SimulatedFlag,
  description: Schema.String,
  rules_by_downstream_use: Schema.Struct({
    screening: LnpDraftDispositionMapping,
    in_vivo: LnpDraftDispositionMapping
  })
}) {}

export class LnpDraftSimulationMixer extends Schema.Class<LnpDraftSimulationMixer>(
  "LnpDraftSimulationMixer"
)({
  total_flow_rate_ml_min: Schema.Number.pipe(Schema.positive()),
  flow_rate_ratio_aqueous_to_organic: Schema.Number.pipe(Schema.positive()),
  temperature_c: Schema.Number
}) {}

export class LnpDraftSimulation extends Schema.Class<LnpDraftSimulation>(
  "LnpDraftSimulation"
)({
  label: Schema.Literal("ALL VALUES SIMULATED"),
  mixer: LnpDraftSimulationMixer,
  dls_t0: Schema.Struct({
    z_avg_nm: Schema.Number.pipe(Schema.positive()),
    pdi: Schema.Number.pipe(Schema.nonNegative())
  }),
  ribogreen: Schema.Struct({
    ee_pct: Schema.Number.pipe(Schema.between(0, 100))
  }),
  dls_t24h: Schema.Struct({
    z_avg_nm: Schema.Number.pipe(Schema.positive())
  })
}) {}

export class LnpDraftProtocol extends Schema.Class<LnpDraftProtocol>("LnpDraftProtocol")({
  draft: Schema.Literal(true),
  schema_version: Schema.Literal("0.1.0-draft"),
  disclaimer: Schema.String,
  protocol_id: Schema.String.pipe(Schema.pattern(/^pv_[a-z0-9_]+_\d+\.\d+\.\d+$/i)),
  family: Schema.String.pipe(Schema.pattern(/^[a-z0-9_]+$/i)),
  semver: Schema.String.pipe(Schema.pattern(/^\d+\.\d+\.\d+$/)),
  status: ProtocolStatus,
  product_line: ProductLine,
  materials: Schema.NonEmptyArray(LnpDraftMaterial),
  formulation: LnpDraftFormulation,
  process_steps: Schema.NonEmptyArray(LnpDraftProcessStep),
  qc_assays: Schema.NonEmptyArray(LnpDraftQcAssay),
  release_specs: LnpDraftReleaseSpecs,
  decision_points: Schema.Struct({
    qc_disposition: LnpDraftQcDisposition
  }),
  simulation: LnpDraftSimulation
}) {}

export const decodeLnpDraftProtocol = Schema.decodeUnknown(LnpDraftProtocol)
export const decodeLnpDraftProtocolSync = Schema.decodeUnknownSync(LnpDraftProtocol)

export const resolveLnpDraftProtocolPath = (overridePath?: string): string =>
  path.resolve(process.cwd(), overridePath ?? DEFAULT_LNP_DRAFT_PROTOCOL_PATH)

export const loadLnpDraftProtocol = (
  overridePath?: string
): Effect.Effect<LnpDraftProtocol, Error> =>
  Effect.tryPromise({
    try: async () => {
      const filePath = resolveLnpDraftProtocolPath(overridePath)
      const rawText = await readFile(filePath, "utf8")
      return JSON.parse(rawText) as unknown
    },
    catch: (cause) =>
      new Error(`Failed to read SIMULATED LNP draft protocol: ${String(cause)}`)
  }).pipe(
    Effect.flatMap((raw) =>
      decodeLnpDraftProtocol(raw).pipe(
        Effect.mapError(
          (parseError) =>
            new Error(
              `SIMULATED LNP draft protocol failed Effect Schema validation: ${String(parseError)}`
            )
        )
      )
    )
  )

export const toProtocolVersion = (
  draft: typeof LnpDraftProtocol.Type,
  createdAt: Rfc3339UtcTimestamp
): ProtocolVersion =>
  Schema.decodeUnknownSync(ProtocolVersion)({
    id: draft.protocol_id,
    family: draft.family,
    semver: draft.semver,
    status: draft.status,
    parent_version: null,
    steps: draft.process_steps.map((step) => ({
      key: step.key,
      expected_duration_minutes: step.expected_duration_minutes,
      params_schema: Object.fromEntries(
        Object.entries(step.params).map(([name, bound]) => [
          name,
          {
            type: bound.type,
            ...(bound.min !== undefined ? { min: bound.min } : {}),
            ...(bound.max !== undefined ? { max: bound.max } : {})
          }
        ])
      )
    })),
    applicability: {
      hosts: ["microfluidic_mixer"],
      molecule_types: ["lnp_formulation_design", "mrna"],
      mw_da_range: [1, 1_000_000_000]
    },
    change_summary: draft.disclaimer,
    promotion_record_id: null,
    created_at: createdAt
  })

export const toReleaseSpec = (
  draft: LnpDraftProtocol,
  id: ReleaseSpecId
): ReleaseSpec =>
  new ReleaseSpec({
    id,
    purity_pct_min: null,
    monomer_pct_min: null,
    endotoxin_eu_per_mg_max: null,
    dls_z_avg_nm_range: draft.release_specs.dls_z_avg_nm_range,
    dls_pdi_max: draft.release_specs.dls_pdi_max,
    ribogreen_ee_pct_min: draft.release_specs.ribogreen_ee_pct_min
  })

export const toLipidInventory = (draft: LnpDraftProtocol) =>
  draft.materials.map((material) => ({
    lipidId: material.id,
    lotNumber: material.lot_number,
    availableMg: material.available_mg,
    expiresAt: material.expires_at as IsoCalendarDate
  }))

