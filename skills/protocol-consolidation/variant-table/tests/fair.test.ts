import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { buildRoCrate, validateRoCrate11, writeRoCrate } from "../src/ro-crate.ts"
import type { LabOntology } from "../src/types.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.join(here, "../src/cli.ts")
const graphPath = path.join(here, "../../examples/SYNTHETIC-ribogreen-ee/lab-ontology.json")
const contextPath = path.join(here, "../../schemas/lab-ontology.context.jsonld")

describe("FAIR-ready export", () => {
  const graph = JSON.parse(readFileSync(graphPath, "utf8")) as LabOntology

  it("maps ontology terms to PROV-O, OBI, ChEBI, and UCUM without inventing IDs", () => {
    const ctx = JSON.parse(readFileSync(contextPath, "utf8")) as {
      "@context": Record<string, unknown>
    }
    const c = ctx["@context"]
    assert.equal((c.ProtocolVersion as { "@id": string })["@id"], "prov:Plan")
    assert.equal((c.Run as { "@id": string })["@id"], "prov:Activity")
    assert.equal((c.Dataset as { "@id": string })["@id"], "prov:Entity")
    assert.equal((c.ran_under as { "@id": string })["@id"], "prov:qualifiedAssociation")
    assert.equal((c.hadPlan as { "@id": string })["@id"], "prov:hadPlan")
    assert.equal((c.generated_by as { "@id": string })["@id"], "prov:wasGeneratedBy")
    assert.equal((c.measured_on as { "@id": string })["@id"], "prov:used")
    assert.equal((c.used as { "@id": string })["@id"], "prov:used")
    assert.equal((c.supersedes as { "@id": string })["@id"], "prov:wasRevisionOf")
    assert.equal((c.owns as { "@id": string })["@id"], "prov:qualifiedAttribution")
    assert.equal((c.approved as { "@id": string })["@id"], "prov:qualifiedAttribution")
    assert.equal((c.hadRole as { "@id": string })["@id"], "prov:hadRole")
    assert.equal((c.protocol as { "@id": string })["@id"], "obi:OBI_0000272")
    assert.equal((c.AssayType as { "@id": string })["@id"], "obi:OBI_0000070")
    assert.equal((c.triton_x100 as { "@id": string })["@id"], "chebi:CHEBI_9750")
    assert.match(String(c.ribogreen_chebi_todo), /TODO: no ChEBI term/)
    assert.equal(c.ucum, "http://unitsofmeasure.org/")
    const units = c.units as Record<string, { "@id": string; "schema:unitCode": string }>
    assert.equal(units.ug_per_mL["schema:unitCode"], "ug/mL")
    assert.equal(units.Cel["schema:unitCode"], "Cel")
    assert.equal(units.ug_per_mL["@id"], "qudt:MicroGM-PER-MilliL")
    const assay = graph.entities.assay_types?.find((item) => item.id === "ribogreen-ee")
    assert.equal(assay?.obi_id, "OBI:0000070")
    const triton = graph.entities.reagents?.find((item) => item.id === "triton-x100")
    const dye = graph.entities.reagents?.find((item) => item.id === "ribogreen")
    assert.equal(triton?.chebi_id, "CHEBI:9750")
    assert.equal(dye?.chebi_id, null)
  })

  it("builds an RO-Crate 1.1 bundle for a ProtocolVersion with datasets and publications", () => {
    const built = buildRoCrate({ graph, protocolId: "pv-N101-v2" })
    const metadata = { "@context": built.context, "@graph": built.graph }
    assert.deepEqual(validateRoCrate11(metadata), [])
    const serialized = JSON.stringify(metadata)
    assert.match(serialized, /prov:Plan/)
    assert.match(serialized, /prov:Activity/)
    assert.match(serialized, /prov:hadPlan/)
    assert.match(serialized, /prov:wasGeneratedBy/)
    assert.match(serialized, /run-north-plate-1/)
    assert.match(serialized, /ds-north-plate-1/)
    assert.match(serialized, /10\.0000\/SYNTHETIC\.ribogreen\.1/)
    assert.match(serialized, /OBI:0000070/)
    assert.match(serialized, /CHEBI:9750/)
    assert.match(serialized, /TODO: no ChEBI term/)
    assert.match(serialized, /assay_owner/)
    assert.match(serialized, /approver/)
    assert.match(serialized, /FAIR-ready export/)
    assert.doesNotMatch(serialized, /FAIR-compliant/)
    assert.doesNotMatch(serialized, /"FAIR"/)
    const datasetNode = (built.graph as Array<Record<string, unknown>>).find(
      (node) => node["@id"] === "#dataset/ds-north-plate-1"
    )
    assert.equal("prov:qualifiedAssociation" in (datasetNode ?? {}), false)
    const runNode = (built.graph as Array<Record<string, unknown>>).find(
      (node) => node["@id"] === "#run/run-north-plate-1"
    )
    assert.ok(runNode?.["prov:qualifiedAssociation"])
  })

  it("uses a UCUM namespace URL that resolves", async () => {
    const ctx = JSON.parse(readFileSync(contextPath, "utf8")) as { "@context": { ucum: string } }
    assert.equal(ctx["@context"].ucum, "http://unitsofmeasure.org/")
    const response = await fetch(ctx["@context"].ucum, { method: "HEAD", redirect: "follow" })
    assert.equal(response.ok, true, `UCUM namespace ${ctx["@context"].ucum} returned ${response.status}`)
  })

  it("writes the crate via CLI and validates RO-Crate 1.1 structure", () => {
    const out = mkdtempSync(path.join(tmpdir(), "fair-crate-"))
    try {
      const result = spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--disable-warning=ExperimentalWarning",
          cli,
          "ro-crate",
          "--ontology",
          graphPath,
          "--protocol",
          "pv-N101-v2",
          "--out",
          out
        ],
        { encoding: "utf8" }
      )
      assert.equal(result.status, 0, result.stderr)
      const metadata = JSON.parse(readFileSync(path.join(out, "ro-crate-metadata.json"), "utf8")) as Record<
        string,
        unknown
      >
      assert.deepEqual(validateRoCrate11(metadata), [])
      const written = writeRoCrate({ graph, protocolId: "pv-N101-v2", outDir: out })
      assert.equal(written.metadataPath.endsWith("ro-crate-metadata.json"), true)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })
})
