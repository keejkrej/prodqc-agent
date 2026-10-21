import { Schema } from "effect"
import {
  BatchId,
  ChangeProposalId,
  ConstructId,
  DeliveryId,
  DesignId,
  DeviationId,
  HumanOnlyProseSchema,
  InstrumentEventId,
  InstrumentId,
  IsoCalendarDate,
  LabId,
  PromotionRecordId,
  ProtocolFamily,
  ProtocolVersionId,
  QCMeasurementId,
  ReleaseSpecId,
  RequestId,
  Rfc3339UtcTimestamp,
  RunId,
  S3ObjectUri,
  SemverString,
  Sha256Hash,
  StepId,
  UserId,
  VialId
} from "./ids.ts"

/**
 * §3.1 & §3.2 Structured Run Data Model
 *
 * Principle: Agents read structured run data, never prose lab books.
 * Every entity and enum matches the specification schemas in §3.2 and §5.
 */

// ---------------------------------------------------------------------------
// 1. Request & Release Spec (Multi-Modality: Protein, LNP, Nucleic Acid, etc.)
// ---------------------------------------------------------------------------

export const ProductLine = Schema.Literal(
  "protein",
  "lnp_formulation",
  "nucleic_acid",
  "peptide",
  "conjugate",
  "viral_vector",
  "cell_free"
)
export type ProductLine = typeof ProductLine.Type

export const ServiceLevel = Schema.Literal("standard", "expedited")
export type ServiceLevel = typeof ServiceLevel.Type

/**
 * Intended downstream use stated on an LNP work order.
 * Disposition thresholds are the same; the action mapping differs by study type.
 */
export const DownstreamStudyType = Schema.Literal("screening", "in_vivo")
export type DownstreamStudyType = typeof DownstreamStudyType.Type

/**
 * QC disposition for a formulated LNP batch relative to the work order's downstream use.
 */
export const LnpQcDispositionAction = Schema.Literal(
  "release_for_cell_experiment",
  "use_with_note",
  "remake"
)
export type LnpQcDispositionAction = typeof LnpQcDispositionAction.Type

export const RequestedFormat = Schema.Literal(
  "frozen_aliquot",
  "lyophilized",
  "lnp_suspension",
  "aqueous_solution",
  "dried_pellet"
)
export type RequestedFormat = typeof RequestedFormat.Type

export const RequestState = Schema.Literal(
  "submitted",
  "screening",
  "triaged",
  "scheduled",
  "in_production",
  "qc",
  "released",
  "shipped",
  "delivered",
  "cancelled",
  "failed"
)
export type RequestState = typeof RequestState.Type

export const Visibility = Schema.Literal("lab_private", "cluster_shared")
export type Visibility = typeof Visibility.Type

export const BiosafetyScreenVerdict = Schema.Literal("clear", "review", "block")
export type BiosafetyScreenVerdict = typeof BiosafetyScreenVerdict.Type

export class BiosafetyScreenRecord extends Schema.Class<BiosafetyScreenRecord>(
  "BiosafetyScreenRecord"
)({
  verdict: BiosafetyScreenVerdict,
  database_version: Schema.String,
  screened_at: Rfc3339UtcTimestamp,
  matched_watchlist_ids: Schema.Array(Schema.String),
  flagged_motifs: Schema.Array(Schema.String),
  reviewed_by: Schema.NullOr(UserId)
}) {}

export class ReleaseSpec extends Schema.Class<ReleaseSpec>("ReleaseSpec")({
  id: ReleaseSpecId,
  purity_pct_min: Schema.NullOr(Schema.Number),
  monomer_pct_min: Schema.NullOr(Schema.Number),
  endotoxin_eu_per_mg_max: Schema.NullOr(Schema.Number),
  dls_z_avg_nm_range: Schema.NullOr(Schema.Tuple(Schema.Number, Schema.Number)),
  dls_pdi_max: Schema.NullOr(Schema.Number),
  ribogreen_ee_pct_min: Schema.NullOr(Schema.Number),
  additional_modality_specs: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Struct({
        min: Schema.NullOr(Schema.Number),
        max: Schema.NullOr(Schema.Number),
        unit: Schema.String
      })
    })
  )
}) {}

export class Request extends Schema.Class<Request>("Request")({
  id: RequestId,
  lab_id: LabId,
  submitted_by: UserId,
  product_line: ProductLine,
  service_level: ServiceLevel,
  designs: Schema.Array(DesignId),
  requested_amount_mg: Schema.NullOr(Schema.Number),
  requested_format: RequestedFormat,
  release_spec_id: ReleaseSpecId,
  state: RequestState,
  biosafety_screen: Schema.NullOr(BiosafetyScreenRecord),
  committed_delivery_date: Schema.NullOr(IsoCalendarDate),
  visibility: Visibility,
  created_at: Rfc3339UtcTimestamp,
  /**
   * Free text allowed only in `notes`; excluded from every agent prompt by
   * the data-access layer and never used to compute a decision (§3).
   */
  notes: Schema.optional(HumanOnlyProseSchema)
}) {}

// ---------------------------------------------------------------------------
// 2. Design — The Lab's IP; Immutable Once Submitted
// ---------------------------------------------------------------------------

export const MoleculeType = Schema.Literal(
  "protein",
  "peptide",
  "nucleic_acid_payload",
  "mrna",
  "plasmid_dna",
  "oligonucleotide",
  "conjugate",
  "lnp_formulation_design"
)
export type MoleculeType = typeof MoleculeType.Type

export class SequenceAnnotation extends Schema.Class<SequenceAnnotation>(
  "SequenceAnnotation"
)({
  type: Schema.Literal("domain", "signal_peptide", "linker", "tag", "motif", "modification"),
  start: Schema.Number.pipe(Schema.int(), Schema.positive()),
  end: Schema.Number.pipe(Schema.int(), Schema.positive()),
  label: Schema.String
}) {}

export class StructuredTargetDescription extends Schema.Class<StructuredTargetDescription>(
  "StructuredTargetDescription"
)({
  target_id: Schema.String,
  modality: Schema.Literal(
    "binder",
    "enzyme",
    "antigen",
    "cytokine",
    "scaffold",
    "payload",
    "lnp_carrier",
    "conjugate_therapeutic",
    "delivery_vector"
  )
}) {}

export class DesignConstraints extends Schema.Class<DesignConstraints>(
  "DesignConstraints"
)({
  no_tags: Schema.Boolean,
  required_tags: Schema.Array(Schema.String),
  glyco_required: Schema.Boolean
}) {}

export class Design extends Schema.Class<Design>("Design")({
  id: DesignId,
  request_id: RequestId,
  molecule_type: MoleculeType,
  sequence: Schema.String.pipe(Schema.minLength(1)),
  sequence_hash: Sha256Hash,
  annotations: Schema.Array(SequenceAnnotation),
  target_description_structured: StructuredTargetDescription,
  constraints: DesignConstraints
}) {}

// ---------------------------------------------------------------------------
// 3. Construct — What Is Actually Built / Expressed / Formulated
// ---------------------------------------------------------------------------

export const ExpressionHost = Schema.Literal(
  "e_coli_bl21",
  "e_coli_shuffle",
  "hek293f",
  "expi293",
  "cho",
  "cell_free",
  "ivt_enzymatic",
  "microfluidic_mixer",
  "chemical_synthesis"
)
export type ExpressionHost = typeof ExpressionHost.Type

export const CodonOptimizationTarget = Schema.Literal("e_coli", "human", "none")
export type CodonOptimizationTarget = typeof CodonOptimizationTarget.Type

export const DnaSource = Schema.Literal("synthesized", "in_house_clone", "not_applicable")
export type DnaSource = typeof DnaSource.Type

export const ConstructStatus = Schema.Literal("proposed", "approved", "superseded")
export type ConstructStatus = typeof ConstructStatus.Type

export class ConstructFeasibility extends Schema.Class<ConstructFeasibility>(
  "ConstructFeasibility"
)({
  score: Schema.Number.pipe(Schema.between(0, 1)),
  risk_flags: Schema.Array(
    Schema.Literal(
      "high_cys_count",
      "transmembrane_helix",
      "extreme_pi",
      "high_disorder",
      "aggregation_prone",
      "large_mw",
      "protease_susceptible",
      "high_pdi_risk",
      "low_encapsulation_risk",
      "secondary_structure_instability"
    )
  )
}) {}

export class Construct extends Schema.Class<Construct>("Construct")({
  id: ConstructId,
  design_id: DesignId,
  expression_host: ExpressionHost,
  vector: Schema.String,
  tag_scheme: Schema.Array(Schema.String),
  codon_optimized_for: CodonOptimizationTarget,
  dna_source: DnaSource,
  predicted_mw_da: Schema.Number.pipe(Schema.positive()),
  predicted_pi: Schema.NullOr(Schema.Number.pipe(Schema.between(0, 14))),
  feasibility: ConstructFeasibility,
  status: ConstructStatus
}) {}

/**
 * §4 De-identified Construct Class Key used for cluster-wide aggregation.
 * Never includes `sequence`, `sequence_hash`, `annotations`, or `target_description_structured`.
 */
export class ConstructClassKey extends Schema.Class<ConstructClassKey>(
  "ConstructClassKey"
)({
  product_line: Schema.optional(ProductLine),
  host: ExpressionHost,
  mw_bucket: Schema.Literal("lt_15kda", "15_to_40kda", "40_to_80kda", "gt_80kda", "nanoparticle_nm"),
  tag_scheme_key: Schema.String,
  cys_count_bucket: Schema.Literal("zero", "low_1_to_4", "high_gt_4", "not_applicable")
}) {}

// ---------------------------------------------------------------------------
// 4. Batch — Unit of Scheduling / Capacity
// ---------------------------------------------------------------------------

export const BatchType = Schema.Literal(
  "expression",
  "purification",
  "lnp_formulation",
  "synthesis",
  "conjugation",
  "qc_only"
)
export type BatchType = typeof BatchType.Type

export const BatchState = Schema.Literal("planned", "active", "closed", "aborted")
export type BatchState = typeof BatchState.Type

export class Batch extends Schema.Class<Batch>("Batch")({
  id: BatchId,
  batch_type: BatchType,
  expression_host: ExpressionHost,
  scheduled_start: Rfc3339UtcTimestamp,
  capacity_slots: Schema.Number.pipe(Schema.int(), Schema.positive()),
  /**
   * §6 Insurance Property: target 15% of each batch's slots held as rework buffer [ASSUMPTION]
   */
  reserved_rework_slots: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  assigned_runs: Schema.Array(RunId),
  operator_id: UserId,
  state: BatchState
}) {}

// ---------------------------------------------------------------------------
// 5. Run — One Construct Through One Batch Under One ProtocolVersion
// ---------------------------------------------------------------------------

export const AssignmentArm = Schema.Literal("default", "canary", "shadow")
export type AssignmentArm = typeof AssignmentArm.Type

export const RunOutcome = Schema.Literal("pending", "success", "partial", "failed")
export type RunOutcome = typeof RunOutcome.Type

export const ParameterValue = Schema.Union(
  Schema.Number,
  Schema.String,
  Schema.Boolean
)
export type ParameterValue = typeof ParameterValue.Type

export class Run extends Schema.Class<Run>("Run")({
  id: RunId,
  construct_id: ConstructId,
  batch_id: BatchId,
  protocol_version_id: ProtocolVersionId,
  parameter_bindings: Schema.Record({
    key: Schema.String,
    value: ParameterValue
  }),
  assignment_arm: AssignmentArm,
  outcome: RunOutcome,
  yield_mg: Schema.NullOr(Schema.Number.pipe(Schema.nonNegative())),
  purity_pct: Schema.NullOr(Schema.Number.pipe(Schema.between(0, 100))),
  cost_units: Schema.Number.pipe(Schema.nonNegative()),
  started_at: Schema.NullOr(Rfc3339UtcTimestamp),
  ended_at: Schema.NullOr(Rfc3339UtcTimestamp)
}) {}

// ---------------------------------------------------------------------------
// 6. Step & InstrumentEvent
// ---------------------------------------------------------------------------

export const StepState = Schema.Literal(
  "pending",
  "running",
  "done",
  "skipped",
  "failed"
)
export type StepState = typeof StepState.Type

export class Step extends Schema.Class<Step>("Step")({
  id: StepId,
  run_id: RunId,
  protocol_step_key: Schema.String,
  ordinal: Schema.Number.pipe(Schema.int(), Schema.positive()),
  planned_params: Schema.Record({ key: Schema.String, value: ParameterValue }),
  actual_params: Schema.NullOr(
    Schema.Record({ key: Schema.String, value: ParameterValue })
  ),
  expected_duration_minutes: Schema.NullOr(Schema.Number.pipe(Schema.positive())),
  operator_id: Schema.NullOr(UserId),
  state: StepState,
  started_at: Schema.NullOr(Rfc3339UtcTimestamp),
  ended_at: Schema.NullOr(Rfc3339UtcTimestamp)
}) {}

export const InstrumentEventType = Schema.Literal(
  "start",
  "reading",
  "alarm",
  "offline",
  "maintenance",
  "end"
)
export type InstrumentEventType = typeof InstrumentEventType.Type

export const TelemetrySeverity = Schema.Literal("info", "warn", "error")
export type TelemetrySeverity = typeof TelemetrySeverity.Type

export class InstrumentEvent extends Schema.Class<InstrumentEvent>("InstrumentEvent")({
  id: InstrumentEventId,
  step_id: StepId,
  instrument_id: InstrumentId,
  event_type: InstrumentEventType,
  payload: Schema.Record({ key: Schema.String, value: ParameterValue }),
  severity: TelemetrySeverity,
  occurred_at: Rfc3339UtcTimestamp,
  recorded_at: Rfc3339UtcTimestamp
}) {}

// ---------------------------------------------------------------------------
// 7. QCMeasurement
// ---------------------------------------------------------------------------

export const QCAssay = Schema.Literal(
  "a280",
  "sds_page",
  "sec_hplc",
  "lc_ms_intact",
  "endotoxin",
  "dls_size",
  "dls_pdi",
  "dls_size_drift",
  "ribogreen_ee",
  "zeta"
)
export type QCAssay = typeof QCAssay.Type

export const QCMetric = Schema.Literal(
  "purity_pct",
  "monomer_pct",
  "mass_da",
  "eu_per_mg",
  "z_avg_nm",
  "pdi",
  "ee_pct",
  "size_drift_nm",
  "zeta_mv",
  "concentration_mg_ml"
)
export type QCMetric = typeof QCMetric.Type

export const QCUnit = Schema.Literal(
  "percent",
  "Da",
  "EU/mg",
  "nm",
  "dimensionless",
  "mV",
  "mg/mL"
)
export type QCUnit = typeof QCUnit.Type

export const QCVerdict = Schema.Literal("pass", "fail", "out_of_spec_accepted")
export type QCVerdict = typeof QCVerdict.Type

export class QCMeasurement extends Schema.Class<QCMeasurement>("QCMeasurement")({
  id: QCMeasurementId,
  run_id: RunId,
  assay: QCAssay,
  metric: QCMetric,
  value: Schema.Number,
  unit: QCUnit,
  instrument_id: InstrumentId,
  raw_file_uri: S3ObjectUri,
  spec_min: Schema.NullOr(Schema.Number),
  spec_max: Schema.NullOr(Schema.Number),
  verdict: QCVerdict,
  measured_at: Rfc3339UtcTimestamp
}) {}

// ---------------------------------------------------------------------------
// 8. Deviation — Including Fab-Side Loss & Insurance Attribution (§3.2, §6)
// ---------------------------------------------------------------------------

export const DeviationScopeType = Schema.Literal("run", "batch", "instrument")
export type DeviationScopeType = typeof DeviationScopeType.Type

export const DeviationCategory = Schema.Literal(
  "instrument_failure",
  "contamination",
  "operator_error",
  "material_shortage",
  "low_yield",
  "qc_fail",
  "shipping"
)
export type DeviationCategory = typeof DeviationCategory.Type

export const CauseAttribution = Schema.Literal(
  "fab",
  "client_design",
  "supplier",
  "unknown"
)
export type CauseAttribution = typeof CauseAttribution.Type

export const DeviationResolution = Schema.Literal(
  "rerun",
  "reschedule",
  "partial_release",
  "cancel"
)
export type DeviationResolution = typeof DeviationResolution.Type

export class DeviationImpact extends Schema.Class<DeviationImpact>("DeviationImpact")({
  runs_lost: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
  delay_days: Schema.Number.pipe(Schema.nonNegative())
}) {}

export class Deviation extends Schema.Class<Deviation>("Deviation")({
  id: DeviationId,
  scope_type: DeviationScopeType,
  scope_id: Schema.Union(RunId, BatchId, InstrumentId),
  category: DeviationCategory,
  cause_attribution: CauseAttribution,
  impact: DeviationImpact,
  resolution: Schema.NullOr(DeviationResolution),
  client_bears_cost: Schema.Boolean,
  opened_at: Rfc3339UtcTimestamp,
  closed_at: Schema.NullOr(Rfc3339UtcTimestamp)
}) {}

// ---------------------------------------------------------------------------
// 9. ProtocolVersion, ChangeProposal & PromotionRecord (§3.2, §5)
// ---------------------------------------------------------------------------

export const ProtocolStatus = Schema.Literal(
  "draft",
  "shadow",
  "canary",
  "default",
  "deprecated"
)
export type ProtocolStatus = typeof ProtocolStatus.Type

export class ParameterBoundSpec extends Schema.Class<ParameterBoundSpec>(
  "ParameterBoundSpec"
)({
  type: Schema.Literal("number", "string", "boolean"),
  min: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
  allowed_values: Schema.optional(Schema.Array(ParameterValue))
}) {}

export class ProtocolStepDefinition extends Schema.Class<ProtocolStepDefinition>(
  "ProtocolStepDefinition"
)({
  key: Schema.String,
  expected_duration_minutes: Schema.optional(Schema.Number.pipe(Schema.positive())),
  params_schema: Schema.Record({
    key: Schema.String,
    value: ParameterBoundSpec
  })
}) {}

export class ProtocolApplicability extends Schema.Class<ProtocolApplicability>(
  "ProtocolApplicability"
)({
  hosts: Schema.Array(ExpressionHost),
  molecule_types: Schema.Array(MoleculeType),
  mw_da_range: Schema.Tuple(Schema.Number, Schema.Number)
}) {}

export class ProtocolVersion extends Schema.Class<ProtocolVersion>("ProtocolVersion")({
  id: ProtocolVersionId,
  family: ProtocolFamily,
  semver: SemverString,
  status: ProtocolStatus,
  parent_version: Schema.NullOr(ProtocolVersionId),
  steps: Schema.Array(ProtocolStepDefinition),
  applicability: ProtocolApplicability,
  change_summary: Schema.String,
  promotion_record_id: Schema.NullOr(PromotionRecordId),
  created_at: Rfc3339UtcTimestamp
}) {}

export class GuardrailMetricRule extends Schema.Class<GuardrailMetricRule>(
  "GuardrailMetricRule"
)({
  metric: Schema.Union(QCMetric, Schema.Literal("yield_mg")),
  non_inferiority_margin: Schema.Number
}) {}

export class AcceptanceRule extends Schema.Class<AcceptanceRule>("AcceptanceRule")({
  model: Schema.String,
  effect_direction: Schema.Literal("increase", "decrease"),
  min_effect: Schema.Number,
  alpha: Schema.Number.pipe(Schema.between(0.0001, 0.5)),
  decision: Schema.String
}) {}

export class GeneralizationRule extends Schema.Class<GeneralizationRule>(
  "GeneralizationRule"
)({
  min_labs: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(2)),
  min_batches: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(3)),
  min_runs_per_arm: Schema.Number.pipe(Schema.int(), Schema.positive()),
  per_lab_sign_consistency: Schema.String
}) {}

export const ChangeProposalState = Schema.Literal(
  "draft",
  "shadow",
  "canary",
  "accepted",
  "rejected",
  "withdrawn"
)
export type ChangeProposalState = typeof ChangeProposalState.Type

export class ChangeProposal extends Schema.Class<ChangeProposal>("ChangeProposal")({
  id: ChangeProposalId,
  protocol_family: ProtocolFamily,
  proposed_semver: SemverString,
  hypothesis: Schema.String,
  primary_metric: Schema.Union(QCMetric, Schema.Literal("yield_mg")),
  guardrail_metrics: Schema.Array(GuardrailMetricRule),
  acceptance_rule: AcceptanceRule,
  generalization_rule: GeneralizationRule,
  evidence_run_ids: Schema.Array(RunId),
  state: ChangeProposalState
}) {}

export class GuardrailEvaluationResult extends Schema.Class<GuardrailEvaluationResult>(
  "GuardrailEvaluationResult"
)({
  metric: Schema.Union(QCMetric, Schema.Literal("yield_mg")),
  estimated_delta: Schema.Number,
  ci_lower: Schema.Number,
  ci_upper: Schema.Number,
  non_inferiority_margin: Schema.Number,
  passed: Schema.Boolean
}) {}

export class PromotionRecord extends Schema.Class<PromotionRecord>("PromotionRecord")({
  id: PromotionRecordId,
  change_proposal_id: ChangeProposalId,
  from_version: ProtocolVersionId,
  to_version: ProtocolVersionId,
  effect_estimate: Schema.Number,
  ci: Schema.Tuple(Schema.Number, Schema.Number),
  n_runs: Schema.Number.pipe(Schema.int(), Schema.positive()),
  n_labs: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(2)),
  n_batches: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(3)),
  evidence_run_ids: Schema.Array(RunId),
  guardrail_results: Schema.Array(GuardrailEvaluationResult),
  query_hash: Sha256Hash,
  signed_off_by: UserId,
  signed_at: Rfc3339UtcTimestamp,
  /**
   * §5 Human in the loop: signing requires a rationale field; stored for humans,
   * never fed to an agent.
   */
  rationale: HumanOnlyProseSchema
}) {}

// ---------------------------------------------------------------------------
// 10. Delivery & Vial — Physical Handoff & Provenance (§3.2, T1.2)
// ---------------------------------------------------------------------------

export class Vial extends Schema.Class<Vial>("Vial")({
  vial_id: VialId,
  run_id: RunId,
  amount_mg: Schema.Number.pipe(Schema.positive()),
  buffer: Schema.String,
  concentration_mg_ml: Schema.Number.pipe(Schema.positive()),
  storage_c: Schema.Number,
  label_qr: Schema.String
}) {}

export const HandoffMethod = Schema.Literal("cluster_courier", "hand_pickup")
export type HandoffMethod = typeof HandoffMethod.Type

export class Delivery extends Schema.Class<Delivery>("Delivery")({
  id: DeliveryId,
  request_id: RequestId,
  vials: Schema.NonEmptyArray(Vial),
  handoff_method: HandoffMethod,
  cold_chain_log_uri: S3ObjectUri,
  released_by: UserId,
  delivered_at: Schema.NullOr(Rfc3339UtcTimestamp)
}) {}
