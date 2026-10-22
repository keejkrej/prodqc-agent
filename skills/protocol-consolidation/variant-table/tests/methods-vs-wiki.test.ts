import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { compareTables } from "../src/compare.ts"
import { extractFromPath } from "../src/extract.ts"
import {
  datasetDatesForPublication,
  selectProtocolForMethods
} from "../src/select-version.ts"
import type { LabOntology, MethodsVsWikiReport, ProtocolVersionInterval } from "../src/types.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.join(here, "../fixtures/methods-vs-wiki")
const cli = path.join(here, "../src/cli.ts")

const versions = (): ProtocolVersionInterval[] =>
  (
    JSON.parse(readFileSync(path.join(fixtureRoot, "versions.json"), "utf8")) as {
      versions: ProtocolVersionInterval[]
    }
  ).versions

describe("methods vs wiki", () => {
  it("prefers linked dataset dates over the submission date", () => {
    const graph = JSON.parse(readFileSync(path.join(fixtureRoot, "ontology.json"), "utf8")) as LabOntology
    const dates = datasetDatesForPublication(graph, "pub-synthetic-1")
    assert.deepEqual(dates, ["2025-09-15"])
    const selected = selectProtocolForMethods({
      versions: versions(),
      datasetDates: dates,
      submitted: "2025-11-01"
    })
    assert.equal(selected.date_basis, "dataset")
    assert.equal(selected.version.id, "pv-N101-v2")
    assert.equal(selected.as_of, "2025-09-15")
  })

  it("uses a dataset date even when submission would pick a later protocol version", () => {
    const selected = selectProtocolForMethods({
      versions: versions(),
      datasetDates: ["2025-04-01"],
      submitted: "2025-11-01"
    })
    assert.equal(selected.date_basis, "dataset")
    assert.equal(selected.version.id, "pv-N101-v1")
  })

  it("throws when linked dataset dates span more than one protocol version", () => {
    assert.throws(
      () =>
        selectProtocolForMethods({
          versions: versions(),
          datasetDates: ["2025-04-01", "2025-09-15"],
          submitted: "2025-11-01"
        }),
      /span multiple protocol versions/
    )
  })

  it("falls back to submission date when there are no linked datasets", () => {
    const graph = JSON.parse(
      readFileSync(path.join(fixtureRoot, "ontology-no-datasets.json"), "utf8")
    ) as LabOntology
    const dates = datasetDatesForPublication(graph, "pub-synthetic-1")
    assert.deepEqual(dates, [])
    const selected = selectProtocolForMethods({
      versions: versions(),
      datasetDates: dates,
      submitted: "2025-11-01"
    })
    assert.equal(selected.date_basis, "submission")
    assert.equal(selected.version.id, "pv-N101-v2")
  })

  it("diffs paper methods against the protocol version selected from dataset dates", () => {
    const selected = selectProtocolForMethods({
      versions: versions(),
      datasetDates: ["2025-09-15"],
      submitted: "2025-11-01"
    })
    const methods = extractFromPath({
      lab_id: "SYNTHETIC-paper",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtureRoot, "paper")
    })
    const wiki = extractFromPath({
      lab_id: "SYNTHETIC-lab-north",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtureRoot, selected.version.source_dir)
    })
    const report = compareTables(methods, wiki)
    const mismatchFields = report.mismatches.map((row) => row.field).sort()
    assert.deepEqual(mismatchFields, ["dye_incubation_time_min", "ee_formula"])
    assert.equal(
      report.mismatches.find((row) => row.field === "dye_incubation_time_min")?.left?.value,
      15
    )
  })

  it("runs the methods-vs-wiki CLI with ontology dataset dates", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--disable-warning=ExperimentalWarning",
        cli,
        "methods-vs-wiki",
        "--methods",
        path.join(fixtureRoot, "paper"),
        "--versions",
        path.join(fixtureRoot, "versions.json"),
        "--ontology",
        path.join(fixtureRoot, "ontology.json"),
        "--publication",
        "pub-synthetic-1",
        "--submitted",
        "2025-11-01",
        "--lab",
        "SYNTHETIC-paper"
      ],
      { encoding: "utf8" }
    )
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as MethodsVsWikiReport
    assert.equal(report.date_basis, "dataset")
    assert.equal(report.selected_protocol_version.id, "pv-N101-v2")
    assert.deepEqual(
      report.mismatches.map((row) => row.field).sort(),
      ["dye_incubation_time_min", "ee_formula"]
    )
  })

  it("runs the methods-vs-wiki CLI falling back to submission when no datasets", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--disable-warning=ExperimentalWarning",
        cli,
        "methods-vs-wiki",
        "--methods",
        path.join(fixtureRoot, "paper"),
        "--versions",
        path.join(fixtureRoot, "versions.json"),
        "--ontology",
        path.join(fixtureRoot, "ontology-no-datasets.json"),
        "--submitted",
        "2025-11-01"
      ],
      { encoding: "utf8" }
    )
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as MethodsVsWikiReport
    assert.equal(report.date_basis, "submission")
    assert.equal(report.selected_protocol_version.id, "pv-N101-v2")
  })
})
