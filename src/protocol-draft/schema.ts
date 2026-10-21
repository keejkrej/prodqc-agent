import { Schema } from "effect"

/**
 * Sourced form of the existing `protocols/*.draft.json` draft schema.
 * Every drafted field carries a pointer to the source line it was read from.
 * Incomplete documents are valid: unread values are omitted, never invented.
 */
export const PROTOCOL_DRAFT_SCHEMA_VERSION = "0.1.0-draft" as const

export class SourcePointer extends Schema.Class<SourcePointer>("SourcePointer")({
  file: Schema.String.pipe(Schema.minLength(1)),
  line: Schema.Number.pipe(Schema.int(), Schema.positive()),
  excerpt: Schema.String.pipe(Schema.minLength(1))
}) {}

export const OpenQuestionKind = Schema.Literal(
  "missing_unit",
  "conflicting_values",
  "vague_endpoint",
  "ungrounded_value",
  "missing_value",
  "ambiguous_branch"
)
export type OpenQuestionKind = typeof OpenQuestionKind.Type

export class OpenQuestion extends Schema.Class<OpenQuestion>("OpenQuestion")({
  id: Schema.String.pipe(Schema.minLength(1)),
  kind: OpenQuestionKind,
  message: Schema.String.pipe(Schema.minLength(1)),
  field_path: Schema.String.pipe(Schema.minLength(1)),
  source: Schema.optional(SourcePointer)
}) {}

export class SourcedText extends Schema.Class<SourcedText>("SourcedText")({
  value: Schema.String,
  source: SourcePointer
}) {}

export class SourcedNumber extends Schema.Class<SourcedNumber>("SourcedNumber")({
  value: Schema.Number,
  ucum: Schema.NullOr(Schema.String.pipe(Schema.minLength(1))),
  source: SourcePointer
}) {}

export class SourcedMaterial extends Schema.Class<SourcedMaterial>("SourcedMaterial")({
  id: Schema.String.pipe(Schema.minLength(1)),
  role: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  name: SourcedText,
  source: SourcePointer
}) {}

export class SourcedParam extends Schema.Class<SourcedParam>("SourcedParam")({
  name: Schema.String.pipe(Schema.minLength(1)),
  value: Schema.Number,
  ucum: Schema.NullOr(Schema.String.pipe(Schema.minLength(1))),
  source: SourcePointer
}) {}

export class ObservationGate extends Schema.Class<ObservationGate>("ObservationGate")({
  kind: Schema.Literal("until_observation"),
  observation: Schema.String.pipe(Schema.minLength(1)),
  source: SourcePointer
}) {}

export class ProcessBranch extends Schema.Class<ProcessBranch>("ProcessBranch")({
  when: SourcedText,
  then: SourcedText,
  source: SourcePointer
}) {}

export class SourcedProcessStep extends Schema.Class<SourcedProcessStep>(
  "SourcedProcessStep"
)({
  key: Schema.String.pipe(Schema.minLength(1)),
  title: SourcedText,
  ordinal: Schema.Number.pipe(Schema.int(), Schema.positive()),
  instrument_role: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  params: Schema.Array(SourcedParam),
  observation_gate: Schema.optional(ObservationGate),
  branches: Schema.Array(ProcessBranch),
  source: SourcePointer
}) {}

export class SourcedQcLimit extends Schema.Class<SourcedQcLimit>("SourcedQcLimit")({
  assay: Schema.String.pipe(Schema.minLength(1)),
  metric: Schema.String.pipe(Schema.minLength(1)),
  timepoint: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  op: Schema.Literal("min", "max", "range", "target"),
  value: Schema.optional(SourcedNumber),
  min: Schema.optional(SourcedNumber),
  max: Schema.optional(SourcedNumber),
  source: SourcePointer
}) {}

export class SourcedFormulation extends Schema.Class<SourcedFormulation>(
  "SourcedFormulation"
)({
  n_p_ratio: Schema.optional(SourcedNumber),
  total_flow_rate: Schema.optional(SourcedNumber),
  flow_rate_ratio_aqueous_to_organic: Schema.optional(SourcedNumber),
  lipid_molar_percent: Schema.Array(SourcedParam)
}) {}

export class SourceDocument extends Schema.Class<SourceDocument>("SourceDocument")({
  file: Schema.String.pipe(Schema.minLength(1)),
  sha256: Schema.String.pipe(Schema.minLength(1)),
  line_count: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}) {}

export class SourcedDraftProtocol extends Schema.Class<SourcedDraftProtocol>(
  "SourcedDraftProtocol"
)({
  draft: Schema.Literal(true),
  schema_version: Schema.Literal(PROTOCOL_DRAFT_SCHEMA_VERSION),
  disclaimer: Schema.String,
  protocol_id: Schema.String.pipe(Schema.minLength(1)),
  family: Schema.String.pipe(Schema.minLength(1)),
  semver: Schema.String.pipe(Schema.minLength(1)),
  status: Schema.Literal("draft"),
  product_line: Schema.optional(Schema.String.pipe(Schema.minLength(1))),
  source_document: SourceDocument,
  model: Schema.String.pipe(Schema.minLength(1)),
  synthetic: Schema.Boolean,
  materials: Schema.Array(SourcedMaterial),
  formulation: SourcedFormulation,
  process_steps: Schema.Array(SourcedProcessStep),
  qc_assays: Schema.Array(SourcedQcLimit),
  release_specs: Schema.Array(SourcedQcLimit),
  open_questions: Schema.Array(OpenQuestion),
  invented_values_rejected: Schema.Number.pipe(Schema.int(), Schema.nonNegative())
}) {}

export const decodeSourcedDraftProtocol = Schema.decodeUnknown(SourcedDraftProtocol)
export const decodeSourcedDraftProtocolSync = Schema.decodeUnknownSync(SourcedDraftProtocol)
export const encodeSourcedDraftProtocolSync = Schema.encodeUnknownSync(SourcedDraftProtocol)
