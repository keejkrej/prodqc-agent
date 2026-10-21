import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const graphPath = path.join(here, "../../examples/SYNTHETIC-ribogreen-ee/lab-ontology.json")

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
})
