import { Context, Effect, Schema, Stream } from "effect"
import type { CapacityEnvelopeSlot, ClusterTechReport } from "../agents/contracts.ts"
import {
  CapabilityViolationError,
  type ProdQcDomainError,
  type RateLimitExceededError
} from "../domain/errors.ts"
import type { EventLogEntry } from "../domain/events.ts"
import {
  EventId,
  IsoCalendarDate,
  type LabId,
  ProtocolFamily,
  RequestId,
  SemverString,
  Sha256Hash,
  VialId
} from "../domain/ids.ts"
import {
  ConstructClassKey,
  DesignConstraints,
  type Deviation,
  ExpressionHost,
  MoleculeType,
  ProductLine,
  type ProtocolVersion,
  type QCMeasurement,
  type Request,
  RequestedFormat,
  RequestState,
  SequenceAnnotation,
  ServiceLevel,
  StructuredTargetDescription,
  Visibility
} from "../domain/models.ts"
import type { ProtocolVersionDiff } from "../services/self-improvement.ts"
import type {
  DeIdentifiedClusterStats,
  VialProvenanceRecord
} from "../services/transparency.ts"

/**
 * §4.1 REST API, §4.2 MCP Server Surface & SolidJS/Rust/Tauri Transport Bridge
 *
 * Parity with machine-accessible surfaces (REST + MCP) across all supported modalities
 * (protein, LNP formulation, nucleic acid, peptide, conjugate, viral vector, cell-free).
 * All 14 REST endpoints and all 10 MCP tools share identical typed schemas and OAuth2 scope checks.
 */

// ---------------------------------------------------------------------------
// 1. OAuth2 Client Credentials & Scope Enforcement (§4.1, §4.2)
// ---------------------------------------------------------------------------

export const OAuthScope = Schema.Literal(
  "requests:write",
  "requests:read",
  "cluster:read",
  "provenance:read"
)
export type OAuthScope = typeof OAuthScope.Type

export interface LabAuthPrincipal {
  readonly labId: LabId
  readonly clientId: string
  readonly grantedScopes: ReadonlySet<OAuthScope>
}

export const requireOAuthScope = (
  principal: LabAuthPrincipal,
  requiredScope: OAuthScope,
  targetResource: string
): Effect.Effect<LabAuthPrincipal, CapabilityViolationError> =>
  principal.grantedScopes.has(requiredScope)
    ? Effect.succeed(principal)
    : Effect.fail(
        new CapabilityViolationError({
          actorId: principal.clientId,
          role: `lab:${principal.labId}`,
          attemptedOperation:
            requiredScope === "requests:write" ? "INSERT" : "SELECT",
          targetResource,
          reason: `Missing required OAuth2 scope '${requiredScope}'.`
        })
      )

// ---------------------------------------------------------------------------
// 2. Request / Response Payloads (§4.1)
// ---------------------------------------------------------------------------

export class SubmitDesignPayload extends Schema.Class<SubmitDesignPayload>(
  "SubmitDesignPayload"
)({
  molecule_type: MoleculeType,
  sequence: Schema.String.pipe(Schema.minLength(1)),
  annotations: Schema.optional(Schema.Array(SequenceAnnotation)),
  constraints: DesignConstraints,
  target_description_structured: StructuredTargetDescription
}) {}

export class SubmitReleaseSpecPayload extends Schema.Class<SubmitReleaseSpecPayload>(
  "SubmitReleaseSpecPayload"
)({
  purity_pct_min: Schema.optional(Schema.Number),
  monomer_pct_min: Schema.optional(Schema.Number),
  endotoxin_eu_per_mg_max: Schema.optional(Schema.Number),
  dls_z_avg_nm_range: Schema.optional(Schema.Tuple(Schema.Number, Schema.Number)),
  dls_pdi_max: Schema.optional(Schema.Number),
  ribogreen_ee_pct_min: Schema.optional(Schema.Number),
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

export class SubmitRequestPayload extends Schema.Class<SubmitRequestPayload>(
  "SubmitRequestPayload"
)({
  product_line: ProductLine,
  service_level: ServiceLevel,
  requested_amount_mg: Schema.NullOr(Schema.Number),
  requested_format: RequestedFormat,
  visibility: Visibility,
  designs: Schema.NonEmptyArray(SubmitDesignPayload),
  release_spec: SubmitReleaseSpecPayload
}) {}

export class SubmitRequestResponse extends Schema.Class<SubmitRequestResponse>(
  "SubmitRequestResponse"
)({
  request_id: RequestId,
  state: RequestState,
  estimated_delivery_window: Schema.Tuple(IsoCalendarDate, IsoCalendarDate)
}) {}

export class WebhookRegistrationPayload extends Schema.Class<WebhookRegistrationPayload>(
  "WebhookRegistrationPayload"
)({
  callback_url: Schema.String,
  subscribed_events: Schema.Array(Schema.String),
  secret_sha256: Sha256Hash
}) {}

// ---------------------------------------------------------------------------
// 3. REST API Contract (§4.1 — All 14 Routes)
// ---------------------------------------------------------------------------

export interface ProdQcRestApiServiceShape {
  /** `POST /v1/requests` — requires `requests:write` */
  readonly submitRequest: (
    principal: LabAuthPrincipal,
    payload: SubmitRequestPayload
  ) => Effect.Effect<
    SubmitRequestResponse,
    ProdQcDomainError | RateLimitExceededError
  >

  /** `GET /v1/requests/{id}` — requires `requests:read` */
  readonly getRequest: (
    principal: LabAuthPrincipal,
    requestId: RequestId
  ) => Effect.Effect<Request, ProdQcDomainError>

  /** `GET /v1/requests/{id}/timeline?granularity=milestone|full` — requires `requests:read` */
  readonly getRequestTimeline: (
    principal: LabAuthPrincipal,
    requestId: RequestId,
    granularity: "milestone" | "full"
  ) => Effect.Effect<
    {
      readonly request_id: RequestId
      readonly events: ReadonlyArray<EventLogEntry>
      readonly chain_head: Sha256Hash
    },
    ProdQcDomainError
  >

  /** `GET /v1/requests/{id}/qc` — requires `requests:read` */
  readonly getRequestQC: (
    principal: LabAuthPrincipal,
    requestId: RequestId
  ) => Effect.Effect<ReadonlyArray<QCMeasurement>, ProdQcDomainError>

  /** `GET /v1/requests/{id}/deviations` — requires `requests:read` */
  readonly getRequestDeviations: (
    principal: LabAuthPrincipal,
    requestId: RequestId
  ) => Effect.Effect<ReadonlyArray<Deviation>, ProdQcDomainError>

  /** `GET /v1/vials/{id}/provenance` — requires `provenance:read` */
  readonly getVialProvenance: (
    principal: LabAuthPrincipal,
    vialId: VialId
  ) => Effect.Effect<VialProvenanceRecord, ProdQcDomainError>

  /** `GET /v1/protocols/{family}` — requires `cluster:read` */
  readonly listProtocolVersions: (
    principal: LabAuthPrincipal,
    family: ProtocolFamily
  ) => Effect.Effect<ReadonlyArray<ProtocolVersion>, ProdQcDomainError>

  /** `GET /v1/protocols/{family}/{semver}` — requires `cluster:read` */
  readonly getProtocolVersion: (
    principal: LabAuthPrincipal,
    family: ProtocolFamily,
    semver: SemverString
  ) => Effect.Effect<ProtocolVersion, ProdQcDomainError>

  /** `GET /v1/protocols/{family}/diff?from=&to=` — requires `cluster:read` */
  readonly diffProtocolVersions: (
    principal: LabAuthPrincipal,
    family: ProtocolFamily,
    fromSemver: SemverString,
    toSemver: SemverString
  ) => Effect.Effect<ProtocolVersionDiff, ProdQcDomainError>

  /** `GET /v1/cluster/stats?host=&class=&from=&to=` — requires `cluster:read` */
  readonly getClusterStats: (
    principal: LabAuthPrincipal,
    params: {
      readonly host?: ExpressionHost
      readonly constructClass?: ConstructClassKey
      readonly from: IsoCalendarDate
      readonly to: IsoCalendarDate
    }
  ) => Effect.Effect<ReadonlyArray<DeIdentifiedClusterStats>, ProdQcDomainError>

  /** `GET /v1/cluster/reports` — requires `cluster:read` */
  readonly getClusterReports: (
    principal: LabAuthPrincipal
  ) => Effect.Effect<ReadonlyArray<ClusterTechReport>, ProdQcDomainError>

  /** `GET /v1/capacity?from=&to=` — requires `cluster:read` */
  readonly getCapacity: (
    principal: LabAuthPrincipal,
    params: { readonly from: IsoCalendarDate; readonly to: IsoCalendarDate }
  ) => Effect.Effect<ReadonlyArray<CapacityEnvelopeSlot>, ProdQcDomainError>

  /** `POST /v1/requests/{id}/cancel` — requires `requests:write` */
  readonly cancelRequest: (
    principal: LabAuthPrincipal,
    requestId: RequestId
  ) => Effect.Effect<Request, ProdQcDomainError>

  /** `GET /v1/events?since_event_id=` and `wss://.../v1/events` — requires `requests:read` */
  readonly streamEvents: (
    principal: LabAuthPrincipal,
    sinceEventId?: EventId
  ) => Stream.Stream<EventLogEntry, ProdQcDomainError>

  /** `POST /v1/webhooks` — requires `requests:write` */
  readonly registerWebhook: (
    principal: LabAuthPrincipal,
    payload: WebhookRegistrationPayload
  ) => Effect.Effect<{ readonly webhook_id: string }, ProdQcDomainError>
}

export class ProdQcRestApiService extends Context.Tag(
  "prodqc-agent/ProdQcRestApiService"
)<ProdQcRestApiService, ProdQcRestApiServiceShape>() {}

// ---------------------------------------------------------------------------
// 4. MCP Server Tool Surface (§4.2 — All 10 Tools 1:1 with REST)
// ---------------------------------------------------------------------------

export type McpToolName =
  | "submit_request"
  | "get_request_status"
  | "get_request_timeline"
  | "get_qc_results"
  | "get_vial_provenance"
  | "list_protocol_versions"
  | "diff_protocol_versions"
  | "get_cluster_stats"
  | "get_capacity"
  | "cancel_request"

export const MCP_TOOL_REQUIRED_SCOPES: Readonly<Record<McpToolName, OAuthScope>> = {
  submit_request: "requests:write",
  get_request_status: "requests:read",
  get_request_timeline: "requests:read",
  get_qc_results: "requests:read",
  get_vial_provenance: "provenance:read",
  list_protocol_versions: "cluster:read",
  diff_protocol_versions: "cluster:read",
  get_cluster_stats: "cluster:read",
  get_capacity: "cluster:read",
  cancel_request: "requests:write"
}

export interface ProdQcMcpServerServiceShape {
  readonly submit_request: ProdQcRestApiServiceShape["submitRequest"]
  readonly get_request_status: ProdQcRestApiServiceShape["getRequest"]
  readonly get_request_timeline: ProdQcRestApiServiceShape["getRequestTimeline"]
  readonly get_qc_results: ProdQcRestApiServiceShape["getRequestQC"]
  readonly get_vial_provenance: ProdQcRestApiServiceShape["getVialProvenance"]
  readonly list_protocol_versions: ProdQcRestApiServiceShape["listProtocolVersions"]
  readonly diff_protocol_versions: ProdQcRestApiServiceShape["diffProtocolVersions"]
  readonly get_cluster_stats: ProdQcRestApiServiceShape["getClusterStats"]
  readonly get_capacity: ProdQcRestApiServiceShape["getCapacity"]
  readonly cancel_request: ProdQcRestApiServiceShape["cancelRequest"]
}

export class ProdQcMcpServerService extends Context.Tag(
  "prodqc-agent/ProdQcMcpServerService"
)<ProdQcMcpServerService, ProdQcMcpServerServiceShape>() {}

// ---------------------------------------------------------------------------
// 5. SolidJS <-> Effect-TS <-> Rust / Tauri IPC Bridge Abstraction
// ---------------------------------------------------------------------------

/**
 * Unified transport abstraction allowing SolidJS UI reactive primitives (`createResource`,
 * `from(Stream)`) to invoke the Rust backend seamlessly whether running inside a Tauri desktop
 * shell (`invoke` / Tauri events) or a browser portal (HTTP REST + WebSocket).
 */
export interface ProdQcHostTransportBridgeShape {
  readonly runtimeMode: "tauri_ipc" | "http_rest"

  readonly invokeCommand: <Req, Res>(params: {
    readonly command: string
    readonly payload: Req
    readonly decodeResponse: (raw: unknown) => Effect.Effect<Res, ProdQcDomainError>
  }) => Effect.Effect<Res, ProdQcDomainError>

  readonly subscribeEventStream: <Ev>(params: {
    readonly channel: string
    readonly decodeEvent: (raw: unknown) => Effect.Effect<Ev, ProdQcDomainError>
  }) => Stream.Stream<Ev, ProdQcDomainError>
}

export class ProdQcHostTransportBridge extends Context.Tag(
  "prodqc-agent/ProdQcHostTransportBridge"
)<ProdQcHostTransportBridge, ProdQcHostTransportBridgeShape>() {}
