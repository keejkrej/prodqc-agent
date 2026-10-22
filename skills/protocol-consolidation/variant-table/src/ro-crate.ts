import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { LabOntology } from "./types.ts"

const CONTEXT_PATH = fileURLToPath(
  new URL("../../schemas/lab-ontology.context.jsonld", import.meta.url)
)

const RO_CRATE_CONFORMS = "https://w3id.org/ro/crate/1.1"
const RO_CRATE_CONTEXT = "https://w3id.org/ro/crate/1.1/context"
const CC_BY_40 = "https://creativecommons.org/licenses/by/4.0/"

export interface RoCrateExport {
  readonly crateDir: string
  readonly metadataPath: string
  readonly metadata: Record<string, unknown>
}

const loadContext = (): Record<string, unknown> =>
  JSON.parse(readFileSync(CONTEXT_PATH, "utf8")) as Record<string, unknown>

export const runIdsForProtocol = (graph: LabOntology, protocolId: string): string[] =>
  graph.edges
    .filter(
      (edge) =>
        edge.type === "ran_under" &&
        edge.from.kind === "run" &&
        edge.to.kind === "protocol_version" &&
        edge.to.id === protocolId
    )
    .map((edge) => edge.from.id)

export const datasetsForProtocol = (graph: LabOntology, protocolId: string): string[] => {
  const runIds = new Set(runIdsForProtocol(graph, protocolId))
  return graph.edges
    .filter(
      (edge) =>
        edge.type === "generated_by" &&
        edge.from.kind === "dataset" &&
        edge.to.kind === "run" &&
        runIds.has(edge.to.id)
    )
    .map((edge) => edge.from.id)
}

export const publicationsForDatasets = (graph: LabOntology, datasetIds: readonly string[]): string[] => {
  const wanted = new Set(datasetIds)
  const figureIds = graph.edges
    .filter(
      (edge) =>
        edge.type === "derived_from" &&
        edge.from.kind === "figure" &&
        edge.to.kind === "dataset" &&
        wanted.has(edge.to.id)
    )
    .map((edge) => edge.from.id)
  const figures = new Set(figureIds)
  return [
    ...new Set(
      graph.edges
        .filter(
          (edge) =>
            edge.type === "reported_in" &&
            edge.from.kind === "figure" &&
            figures.has(edge.from.id) &&
            edge.to.kind === "publication"
        )
        .map((edge) => edge.to.id)
    )
  ]
}

const entityId = (kind: string, id: string): string => `#${kind}/${id}`

const chebiIri = (chebiId: string): string =>
  `http://purl.obolibrary.org/obo/${chebiId.replace(":", "_")}`

const reagentNodeId = (reagent: { readonly id: string; readonly chebi_id?: string | null }): string =>
  reagent.chebi_id ? chebiIri(reagent.chebi_id) : entityId("reagent", reagent.id)

const peopleOnEdge = (
  graph: LabOntology,
  protocolId: string,
  type: "owns" | "approved"
): { readonly id: string; readonly role: string }[] =>
  graph.edges
    .filter(
      (edge) =>
        edge.type === type &&
        edge.from.kind === "person" &&
        edge.to.kind === "protocol_version" &&
        edge.to.id === protocolId
    )
    .map((edge) => ({
      id: edge.from.id,
      role: type === "owns" ? "assay_owner" : "approver"
    }))

const qualifiedAttributions = (graph: LabOntology, protocolId: string): unknown[] =>
  [
    ...peopleOnEdge(graph, protocolId, "owns"),
    ...peopleOnEdge(graph, protocolId, "approved")
  ].map((person) => ({
    "@type": "prov:Attribution",
    "prov:agent": { "@id": entityId("person", person.id) },
    "prov:hadRole": person.role
  }))

const runIdForDataset = (graph: LabOntology, datasetId: string): string | undefined =>
  graph.edges.find(
    (edge) =>
      edge.type === "generated_by" &&
      edge.from.kind === "dataset" &&
      edge.from.id === datasetId &&
      edge.to.kind === "run"
  )?.to.id

const instrumentsUsedByRun = (graph: LabOntology, runId: string): { "@id": string }[] =>
  graph.edges
    .filter(
      (edge) =>
        edge.type === "measured_on" &&
        edge.from.kind === "run" &&
        edge.from.id === runId &&
        edge.to.kind === "instrument"
    )
    .map((edge) => ({ "@id": entityId("instrument", edge.to.id) }))

export const buildRoCrate = (params: {
  readonly graph: LabOntology
  readonly protocolId: string
}): { readonly graph: unknown[]; readonly context: unknown } => {
  const protocol = params.graph.entities.protocol_versions.find((item) => item.id === params.protocolId)
  if (!protocol) {
    throw new Error(`ro-crate: unknown protocol version ${params.protocolId}`)
  }
  const datasetIds = datasetsForProtocol(params.graph, params.protocolId)
  const runIds = runIdsForProtocol(params.graph, params.protocolId)
  const publicationIds = publicationsForDatasets(params.graph, datasetIds)
  const datasets = params.graph.entities.datasets.filter((item) => datasetIds.includes(item.id))
  const runs = (params.graph.entities.runs ?? []).filter((item) => runIds.includes(item.id))
  const publications = params.graph.entities.publications.filter((item) => publicationIds.includes(item.id))
  const assay = params.graph.entities.assay_types?.find((item) => item.id === protocol.assay_type)
  const reagents = params.graph.entities.reagents ?? []
  const people = params.graph.entities.people ?? []
  const ontologyContext = loadContext()
  const personIds = new Set([
    ...peopleOnEdge(params.graph, protocol.id, "owns").map((item) => item.id),
    ...peopleOnEdge(params.graph, protocol.id, "approved").map((item) => item.id)
  ])
  const parts = [
    { "@id": entityId("protocol_version", protocol.id) },
    ...runs.map((item) => ({ "@id": entityId("run", item.id) })),
    ...datasets.map((item) => ({ "@id": entityId("dataset", item.id) })),
    ...publications.map((item) => ({ "@id": entityId("publication", item.id) })),
    ...(assay ? [{ "@id": entityId("assay_type", assay.id) }] : []),
    ...reagents.map((item) => ({ "@id": reagentNodeId(item) }))
  ]
  const nodes: unknown[] = [
    {
      "@id": "ro-crate-metadata.json",
      "@type": "CreativeWork",
      "conformsTo": { "@id": RO_CRATE_CONFORMS },
      "about": { "@id": "./" }
    },
    {
      "@id": "./",
      "@type": ["Dataset", "prov:Entity"],
      "name": `FAIR-ready export of protocol version ${protocol.page_id} v${protocol.version}`,
      "description":
        "Synthetic FAIR-ready export (not a FAIR claim). Bundles one ProtocolVersion with linked datasets and publications.",
      "license": { "@id": CC_BY_40 },
      "hasPart": parts
    },
    {
      "@id": entityId("protocol_version", protocol.id),
      "@type": ["prov:Plan", "obi:OBI_0000272"],
      "name": `ProtocolVersion ${protocol.page_id} v${protocol.version}`,
      "page_id": protocol.page_id,
      "version": protocol.version,
      "valid_from": protocol.valid_from,
      "valid_to": protocol.valid_to,
      "assay_type": protocol.assay_type,
      "obi_id": "OBI:0000272",
      "prov:wasRevisionOf": params.graph.edges
        .filter(
          (edge) =>
            edge.type === "supersedes" &&
            edge.from.kind === "protocol_version" &&
            edge.from.id === protocol.id &&
            edge.to.kind === "protocol_version"
        )
        .map((edge) => ({ "@id": entityId("protocol_version", edge.to.id) })),
      "prov:qualifiedAttribution": qualifiedAttributions(params.graph, protocol.id)
    },
    ...runs.map((item) => ({
      "@id": entityId("run", item.id),
      "@type": "prov:Activity",
      "name": item.id,
      "date": item.date,
      "prov:used": [
        { "@id": entityId("protocol_version", protocol.id) },
        ...instrumentsUsedByRun(params.graph, item.id)
      ],
      "prov:qualifiedAssociation": {
        "@type": "prov:Association",
        "prov:hadPlan": { "@id": entityId("protocol_version", protocol.id) }
      }
    })),
    ...datasets.map((item) => {
      const runId = runIdForDataset(params.graph, item.id)
      return {
        "@id": entityId("dataset", item.id),
        "@type": "prov:Entity",
        "name": item.id,
        "path": item.path,
        "date": item.date,
        ...(runId ? { "prov:wasGeneratedBy": { "@id": entityId("run", runId) } } : {})
      }
    }),
    ...people
      .filter((item) => personIds.has(item.id))
      .map((item) => ({
        "@id": entityId("person", item.id),
        "@type": "prov:Agent",
        "role": item.role
      })),
    ...publications.map((item) => ({
      "@id": entityId("publication", item.id),
      "@type": "ScholarlyArticle",
      "identifier": `https://doi.org/${item.doi}`,
      "doi": item.doi,
      "submitted": item.submitted ?? null
    })),
    ...(assay
      ? [
          {
            "@id": entityId("assay_type", assay.id),
            "@type": "obi:OBI_0000070",
            "name": assay.label ?? assay.id,
            "obi_id": assay.obi_id ?? null
          }
        ]
      : []),
    ...reagents.map((item) => ({
      "@id": reagentNodeId(item),
      "@type": item.chebi_id ? "chebi:ChemicalEntity" : "Reagent",
      "name": item.label,
      "chebi_id": item.chebi_id ?? null,
      ...(item.chebi_id
        ? {}
        : { comment: "TODO: no ChEBI term found. Do not invent an ID." })
    }))
  ]
  return {
    context: [RO_CRATE_CONTEXT, ontologyContext["@context"]],
    graph: nodes
  }
}

export const validateRoCrate11 = (metadata: Record<string, unknown>): string[] => {
  const errors: string[] = []
  const context = metadata["@context"]
  const contextOk = Array.isArray(context)
    ? context.includes(RO_CRATE_CONTEXT)
    : context === RO_CRATE_CONTEXT
  if (!contextOk) errors.push("missing RO-Crate 1.1 @context")
  const graph = metadata["@graph"]
  if (!Array.isArray(graph)) {
    errors.push("missing @graph")
    return errors
  }
  const descriptor = graph.find(
    (node) =>
      node && typeof node === "object" && (node as { "@id"?: string })["@id"] === "ro-crate-metadata.json"
  ) as { conformsTo?: { "@id"?: string }; about?: { "@id"?: string } } | undefined
  if (!descriptor) errors.push("missing ro-crate-metadata.json descriptor")
  else {
    if (descriptor.conformsTo?.["@id"] !== RO_CRATE_CONFORMS) {
      errors.push("descriptor does not conformTo RO-Crate 1.1")
    }
    if (descriptor.about?.["@id"] !== "./") errors.push("descriptor about is not ./")
  }
  const root = graph.find(
    (node) => node && typeof node === "object" && (node as { "@id"?: string })["@id"] === "./"
  ) as { "@type"?: unknown; hasPart?: unknown } | undefined
  if (!root) errors.push("missing root dataset ./")
  else if (!root.hasPart) errors.push("root dataset has no hasPart")
  return errors
}

export const writeRoCrate = (params: {
  readonly graph: LabOntology
  readonly protocolId: string
  readonly outDir: string
}): RoCrateExport => {
  const built = buildRoCrate(params)
  const metadata = {
    "@context": built.context,
    "@graph": built.graph
  }
  const errors = validateRoCrate11(metadata)
  if (errors.length > 0) {
    throw new Error(`ro-crate: invalid 1.1 crate: ${errors.join("; ")}`)
  }
  mkdirSync(params.outDir, { recursive: true })
  const metadataPath = path.join(params.outDir, "ro-crate-metadata.json")
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  writeFileSync(
    path.join(params.outDir, "README.md"),
    "# FAIR-ready export\n\nSynthetic RO-Crate 1.1 bundle. This is a **FAIR-ready export**, not a FAIR claim. See docs/fair.md.\nRecommended metadata license: CC-BY-4.0. Code in this repo: Apache-2.0.\n"
  )
  return { crateDir: params.outDir, metadataPath, metadata }
}
