import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  datasetIdsForPublication,
  protocolVersionIdsForDatasets
} from "../src/select-version.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const exampleDir = path.join(here, "../../examples/SYNTHETIC-ribogreen-ee")
const graphPath = path.join(exampleDir, "lab-ontology.json")
const mappingPath = path.join(exampleDir, "pr2-qc-mapping.json")

interface Endpoint {
  readonly kind: string
  readonly id: string
}

interface Provenance {
  readonly kind: "stated" | "inferred" | "confirmed"
  readonly reason?: string
  readonly who?: string
  readonly when?: string
}

interface Graph {
  readonly entities: {
    readonly people: ReadonlyArray<{ readonly id: string; readonly role: string; readonly name?: string }>
    readonly runs: ReadonlyArray<{ readonly id: string; readonly date: string; readonly operator?: string }>
    readonly datasets: ReadonlyArray<{ readonly id: string; readonly path: string; readonly date: string; readonly owner: string }>
    readonly publications: ReadonlyArray<{ readonly id: string; readonly figures: readonly string[] }>
    readonly protocol_versions: ReadonlyArray<{
      readonly id: string
      readonly page_id: string
      readonly version: number
      readonly valid_from: string
      readonly valid_to: string | null
    }>
    readonly assay_types?: ReadonlyArray<{ readonly id: string; readonly obi_id?: string }>
    readonly reagents?: ReadonlyArray<{
      readonly id: string
      readonly label: string
      readonly chebi_id?: string | null
    }>
  }
  readonly edges: ReadonlyArray<{
    readonly type: string
    readonly from: Endpoint
    readonly to: Endpoint
    readonly provenance: Provenance
  }>
}

describe("synthetic lab ontology", () => {
  const graph = JSON.parse(readFileSync(graphPath, "utf8")) as Graph

  it("uses Person role only (no names) and requires provenance on every edge", () => {
    const roles = new Set(graph.entities.people.map((person) => person.role))
    assert.equal(roles.has("assay_owner"), true)
    assert.equal(roles.has("approver"), true)
    assert.notEqual(
      graph.entities.people.find((person) => person.role === "assay_owner")?.id,
      graph.entities.people.find((person) => person.role === "approver")?.id
    )
    for (const person of graph.entities.people) {
      assert.equal("name" in person, false)
      assert.ok(person.role.length > 0)
    }
    const types = new Set(graph.edges.map((edge) => edge.type))
    for (const required of [
      "generated_by",
      "ran_under",
      "reported_in",
      "derived_from",
      "supersedes",
      "applies_to",
      "measured_on",
      "owns",
      "approved"
    ]) {
      assert.equal(types.has(required), true, `missing edge type ${required}`)
    }
    for (const edge of graph.edges) {
      assert.ok(["stated", "inferred", "confirmed"].includes(edge.provenance.kind))
      if (edge.provenance.kind === "inferred") assert.ok(edge.provenance.reason)
      if (edge.provenance.kind === "confirmed") {
        assert.ok(edge.provenance.who)
        assert.ok(edge.provenance.when)
      }
    }
  })

  it("maps Dataset → Run → ProtocolVersion and Run → Instrument", () => {
    const generated = graph.edges.find(
      (item) => item.type === "generated_by" && item.from.id === "ds-north-plate-1"
    )
    assert.equal(generated?.from.kind, "dataset")
    assert.equal(generated?.to.kind, "run")
    const ran = graph.edges.find(
      (item) => item.type === "ran_under" && item.from.id === generated?.to.id
    )
    assert.equal(ran?.from.kind, "run")
    assert.equal(ran?.to.kind, "protocol_version")
    const protocol = graph.entities.protocol_versions.find((item) => item.id === ran?.to.id)
    assert.equal(protocol?.page_id, "N101")
    assert.equal(protocol?.version, 2)
    const measured = graph.edges.find(
      (item) => item.type === "measured_on" && item.from.id === generated?.to.id
    )
    assert.equal(measured?.from.kind, "run")
    assert.equal(measured?.to.kind, "instrument")
    assert.equal(
      graph.edges.some((item) => item.type === "ran_under" && item.from.kind === "dataset"),
      false
    )
    assert.equal(
      graph.edges.some((item) => item.type === "measured_on" && item.from.kind === "dataset"),
      false
    )
  })

  it("joins a PR 2-shaped QCMeasurement onto Dataset generated_by Run ran_under ProtocolVersion", () => {
    const mapping = JSON.parse(readFileSync(mappingPath, "utf8")) as {
      readonly pr2: {
        readonly run: { readonly id: string; readonly protocol_version_id: string }
        readonly qc_measurement: {
          readonly run_id: string
          readonly raw_file_uri: string
          readonly measured_at: string
          readonly instrument_id: string
        }
        readonly operator: { readonly id: string; readonly role: string; readonly name?: string }
      }
      readonly ontology: {
        readonly run: { readonly id: string; readonly pr2_run_id: string }
        readonly dataset: { readonly path: string; readonly date: string; readonly owner: string }
        readonly protocol_version: { readonly id: string; readonly pr2_protocol_version_id: string }
        readonly edges: ReadonlyArray<{ readonly type: string; readonly from: Endpoint; readonly to: Endpoint }>
      }
    }
    assert.equal(mapping.pr2.qc_measurement.run_id, mapping.pr2.run.id)
    assert.equal(mapping.ontology.run.pr2_run_id, mapping.pr2.run.id)
    assert.equal(mapping.pr2.qc_measurement.raw_file_uri, mapping.ontology.dataset.path)
    assert.equal(mapping.pr2.qc_measurement.measured_at.startsWith(mapping.ontology.dataset.date), true)
    assert.equal(mapping.pr2.run.protocol_version_id, mapping.ontology.protocol_version.pr2_protocol_version_id)
    const types = mapping.ontology.edges.map((item) => item.type).sort()
    assert.deepEqual(types, ["generated_by", "measured_on", "ran_under"])
    assert.equal(mapping.pr2.operator.role, "operator")
    assert.equal("name" in mapping.pr2.operator, false)
    const graphDataset = graph.entities.datasets.find((item) => item.id === "ds-north-plate-1")
    assert.equal(graphDataset?.path, mapping.ontology.dataset.path)
    assert.equal(graphDataset?.owner, mapping.pr2.operator.id)
    const owns = graph.edges.find((item) => item.type === "owns")
    assert.equal(owns?.from.kind, "person")
    assert.equal(owns?.to.kind, "protocol_version")
    const owner = graph.entities.people.find((item) => item.id === owns?.from.id)
    assert.equal(owner?.role, "assay_owner")
    const approved = graph.edges.find((item) => item.type === "approved")
    const approver = graph.entities.people.find((item) => item.id === approved?.from.id)
    assert.equal(approver?.role, "approver")
    assert.notEqual(owner?.id, approver?.id)
    const assay = graph.entities.assay_types?.find((item) => item.id === "ribogreen-ee")
    assert.equal(assay?.obi_id, "OBI:0000070")
    const triton = graph.entities.reagents?.find((item) => item.id === "triton-x100")
    const dye = graph.entities.reagents?.find((item) => item.id === "ribogreen")
    assert.equal(triton?.chebi_id, "CHEBI:9750")
    assert.equal(dye?.chebi_id, null)
    const datasetIds = datasetIdsForPublication(graph, "pub-synthetic-1")
    assert.deepEqual(protocolVersionIdsForDatasets(graph, datasetIds), ["pv-N101-v2"])
  })
})
