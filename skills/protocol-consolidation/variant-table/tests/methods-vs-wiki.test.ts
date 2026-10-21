import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { compareTables } from "../src/compare.ts"
import { extractFromPath } from "../src/extract.ts"
import { selectCurrentBefore } from "../src/select-version.ts"
import type { MethodsVsWikiReport, ProtocolVersionInterval } from "../src/types.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.join(here, "../fixtures/methods-vs-wiki")
const cli = path.join(here, "../src/cli.ts")

describe("methods vs wiki", () => {
  it("diffs paper methods against the protocol version current before submission", () => {
    const versions = JSON.parse(readFileSync(path.join(fixtureRoot, "versions.json"), "utf8")) as {
      versions: ProtocolVersionInterval[]
    }
    const selected = selectCurrentBefore(versions.versions, "2025-11-01")
    assert.equal(selected.id, "pv-N101-v2")

    const methods = extractFromPath({
      lab_id: "SYNTHETIC-paper",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtureRoot, "paper")
    })
    const wiki = extractFromPath({
      lab_id: "SYNTHETIC-lab-north",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtureRoot, selected.source_dir)
    })
    const report = compareTables(methods, wiki)
    const mismatchFields = report.mismatches.map((row) => row.field).sort()
    assert.deepEqual(mismatchFields, ["ee_formula", "incubation_time_min"])
    assert.equal(
      report.mismatches.find((row) => row.field === "ee_formula")?.left?.value,
      "total/free"
    )
    assert.equal(
      report.mismatches.find((row) => row.field === "ee_formula")?.right?.value,
      "1-(free/total)"
    )
    assert.equal(
      report.mismatches.find((row) => row.field === "incubation_time_min")?.left?.value,
      15
    )
    assert.ok(report.matches.includes("dye_dilution"))
    assert.ok(report.matches.includes("triton_standard_curve"))
  })

  it("runs the methods-vs-wiki CLI against the synthetic paper", () => {
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
        "--submitted",
        "2025-11-01",
        "--lab",
        "SYNTHETIC-paper"
      ],
      { encoding: "utf8" }
    )
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout) as MethodsVsWikiReport
    assert.equal(report.selected_protocol_version.id, "pv-N101-v2")
    assert.equal(report.submission_date, "2025-11-01")
    assert.deepEqual(
      report.mismatches.map((row) => row.field).sort(),
      ["ee_formula", "incubation_time_min"]
    )
  })
})
