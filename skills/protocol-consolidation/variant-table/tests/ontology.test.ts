import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

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
    readonly datasets: ReadonlyArray<{ readonly id: string; readonly path: string; readonly date: string; readonly owner: string }>
    readonly protocol_versions: ReadonlyArray<{
      readonly id: string
      readonly page_id: string
      readonly version: number
      readonly valid_from: string
      readonly valid_to: string | null
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
    for (const person of graph.entities.people) {
      assert.equal("name" in person, false)
      assert.ok(person.role.length > 0)
    }
    const types = new Set(graph.edges.map((edge) => edge.type))
    for (const required of ["ran_under", "reported_in", "derived_from", "supersedes", "applies_to"]) {
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

  it("maps the synthetic QC dataset onto ProtocolVersion via ran_under", () => {
    const edge = graph.edges.find((item) => item.type === "ran_under")
    assert.ok(edge)
    assert.equal(edge?.from.kind, "dataset")
    assert.equal(edge?.to.kind, "protocol_version")
    assert.equal(edge?.provenance.kind, "stated")
    const dataset = graph.entities.datasets.find((item) => item.id === edge?.from.id)
    const protocol = graph.entities.protocol_versions.find((item) => item.id === edge?.to.id)
    assert.ok(dataset?.path)
    assert.equal(protocol?.page_id, "N101")
    assert.equal(protocol?.version, 2)
    assert.equal(dataset?.owner.startsWith("person:"), true)
  })

  it("joins a PR 2-shaped QCMeasurement onto Dataset ran_under ProtocolVersion", () => {
    const mapping = JSON.parse(readFileSync(mappingPath, "utf8")) as {
      readonly pr2: {
        readonly run: { readonly id: string; readonly protocol_version_id: string }
        readonly qc_measurement: {
          readonly run_id: string
          readonly raw_file_uri: string
          readonly measured_at: string
        }
        readonly operator: { readonly id: string; readonly role: string; readonly name?: string }
      }
      readonly ontology: {
        readonly dataset: { readonly path: string; readonly date: string; readonly owner: string }
        readonly protocol_version: { readonly id: string; readonly pr2_protocol_version_id: string }
        readonly edge: { readonly type: string }
      }
    }
    assert.equal(mapping.pr2.qc_measurement.run_id, mapping.pr2.run.id)
    assert.equal(mapping.pr2.qc_measurement.raw_file_uri, mapping.ontology.dataset.path)
    assert.equal(mapping.pr2.qc_measurement.measured_at.startsWith(mapping.ontology.dataset.date), true)
    assert.equal(mapping.pr2.run.protocol_version_id, mapping.ontology.protocol_version.pr2_protocol_version_id)
    assert.equal(mapping.ontology.edge.type, "ran_under")
    assert.equal(mapping.pr2.operator.role, "operator")
    assert.equal("name" in mapping.pr2.operator, false)
    const graphDataset = graph.entities.datasets[0]
    assert.equal(graphDataset?.path, mapping.ontology.dataset.path)
    assert.equal(graphDataset?.owner, mapping.pr2.operator.id)
  })
})
