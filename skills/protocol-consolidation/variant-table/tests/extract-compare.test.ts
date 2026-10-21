import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { compareTables } from "../src/compare.ts"
import { extractFromPath } from "../src/extract.ts"
import { extractRibogreen } from "../src/ribogreen.ts"
import { selectCurrentBefore } from "../src/select-version.ts"
import type { ProtocolVersionInterval, VariantTable } from "../src/types.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.join(here, "../fixtures")
const cli = path.join(here, "../src/cli.ts")
const exampleVersions = path.join(here, "../../examples/SYNTHETIC-ribogreen-ee/versions")

const extractCli = (args: string[]): { status: number; stdout: string; stderr: string } => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", cli, ...args],
    { encoding: "utf8" }
  )
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

describe("variant-table extract", () => {
  it("extracts Lab North's fixed RiboGreen fields with source pointers", () => {
    const table = extractFromPath({
      lab_id: "SYNTHETIC-lab-north",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtures, "SYNTHETIC-lab-north")
    })
    assert.equal(table.lab_id, "SYNTHETIC-lab-north")
    assert.equal(table.fields.dye_dilution?.value, "1:200")
    assert.equal(table.fields.dye_dilution?.source.file, "page-N101.md")
    assert.equal(table.fields.triton_standard_curve?.value, true)
    assert.equal(table.fields.curve_well_volume_uL?.value, 100)
    assert.equal(table.fields.sample_well_volume_uL?.value, 100)
    assert.equal(table.fields.incubation_time_min?.value, 5)
    assert.equal(table.fields.incubation_temperature_C?.value, 25)
    assert.equal(table.fields.ee_formula?.value, "1-(free/total)")
    assert.equal(table.fields.excitation_nm?.value, 485)
    assert.equal(table.fields.emission_nm?.value, 530)
    for (const field of Object.values(table.fields)) {
      assert.equal(typeof field?.source.line, "number")
      assert.ok((field?.source.line ?? 0) >= 1)
      assert.equal("excerpt" in (field ?? {}), false)
    }
  })

  it("extracts Lab South, including split well volumes and inverted EE formula", () => {
    const table = extractFromPath({
      lab_id: "SYNTHETIC-lab-south",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtures, "SYNTHETIC-lab-south")
    })
    assert.equal(table.fields.dye_dilution?.value, "1:100")
    assert.equal(table.fields.triton_standard_curve?.value, false)
    assert.equal(table.fields.curve_well_volume_uL?.value, 200)
    assert.equal(table.fields.sample_well_volume_uL?.value, 200)
    assert.equal(table.fields.incubation_time_min?.value, 10)
    assert.equal(table.fields.incubation_temperature_C?.value, 22)
    assert.equal(table.fields.ee_formula?.value, "total/free")
    assert.equal(table.fields.excitation_nm?.value, 485)
    assert.equal(table.fields.emission_nm?.value, 520)
  })

  it("normalises 1 - free/total and leaves unread dye dilution unfilled on the v3 notes page", () => {
    const table = extractRibogreen({
      lab_id: "SYNTHETIC-v3",
      sources: [
        {
          file: "SYNTHETIC-v3.md",
          text: [
            "Standard-curve wells were 200 µL. Sample wells were 100 µL.",
            "EE calculated as 1 - free/total using the matching curve for each reading.",
            "Dye dilution not stated in these notes."
          ].join("\n")
        }
      ]
    })
    assert.equal(table.fields.curve_well_volume_uL?.value, 200)
    assert.equal(table.fields.sample_well_volume_uL?.value, 100)
    assert.equal(table.fields.ee_formula?.value, "1-(free/total)")
    assert.equal(table.fields.dye_dilution, undefined)
    assert.equal(table.fields.triton_standard_curve, undefined)
  })

  it("extracts the existing synthetic walkthrough versions without inventing unread fields", () => {
    const v1 = extractFromPath({
      lab_id: "SYNTHETIC-v1",
      assay: "ribogreen-ee",
      inputPath: path.join(exampleVersions, "SYNTHETIC-v1.md")
    })
    assert.equal(v1.fields.dye_dilution?.value, "1:100")
    assert.equal(v1.fields.triton_standard_curve?.value, false)
    assert.equal(v1.fields.curve_well_volume_uL?.value, 200)
    assert.equal(v1.fields.ee_formula?.value, "total/free")
    assert.equal(v1.fields.incubation_time_min, undefined)
    assert.equal(v1.fields.excitation_nm, undefined)
  })
})

describe("variant-table compare", () => {
  it("reports per-field mismatches between the two fictional labs", () => {
    const north = extractFromPath({
      lab_id: "SYNTHETIC-lab-north",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtures, "SYNTHETIC-lab-north")
    })
    const south = extractFromPath({
      lab_id: "SYNTHETIC-lab-south",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtures, "SYNTHETIC-lab-south")
    })
    const report = compareTables(north, south)
    const byField = Object.fromEntries(report.mismatches.map((row) => [row.field, row]))
    assert.equal(report.left.lab_id, "SYNTHETIC-lab-north")
    assert.equal(report.right.lab_id, "SYNTHETIC-lab-south")
    assert.deepEqual(report.matches, ["excitation_nm"])
    assert.equal(byField["dye_dilution"]?.kind, "value_diff")
    assert.equal(byField["dye_dilution"]?.left?.value, "1:200")
    assert.equal(byField["dye_dilution"]?.right?.value, "1:100")
    assert.equal(byField["triton_standard_curve"]?.left?.value, true)
    assert.equal(byField["triton_standard_curve"]?.right?.value, false)
    assert.equal(byField["curve_well_volume_uL"]?.left?.value, 100)
    assert.equal(byField["curve_well_volume_uL"]?.right?.value, 200)
    assert.equal(byField["ee_formula"]?.left?.value, "1-(free/total)")
    assert.equal(byField["ee_formula"]?.right?.value, "total/free")
    assert.equal(byField["emission_nm"]?.left?.value, 530)
    assert.equal(byField["emission_nm"]?.right?.value, 520)
    assert.equal(byField["incubation_time_min"]?.left?.value, 5)
    assert.equal(byField["incubation_time_min"]?.right?.value, 10)
    assert.equal(report.mismatches.some((row) => row.field === "excitation_nm"), false)
  })

  it("flags a field present in only one lab as missing on the other side", () => {
    const left: VariantTable = {
      lab_id: "A",
      assay: "ribogreen-ee",
      fields: {
        dye_dilution: { value: "1:200", source: { file: "a.md", line: 1 } }
      }
    }
    const right: VariantTable = {
      lab_id: "B",
      assay: "ribogreen-ee",
      fields: {
        incubation_time_min: { value: 5, source: { file: "b.md", line: 2 } }
      }
    }
    const report = compareTables(left, right)
    assert.deepEqual(
      report.mismatches.map((row) => row.kind),
      ["missing_right", "missing_left"]
    )
  })
})

describe("variant-table CLI", () => {
  it("extracts and compares via the CLI into a mismatch report", () => {
    const north = extractCli([
      "extract",
      "--lab",
      "SYNTHETIC-lab-north",
      "--assay",
      "ribogreen-ee",
      "--input",
      path.join(fixtures, "SYNTHETIC-lab-north")
    ])
    const south = extractCli([
      "extract",
      "--lab",
      "SYNTHETIC-lab-south",
      "--input",
      path.join(fixtures, "SYNTHETIC-lab-south")
    ])
    assert.equal(north.status, 0, north.stderr)
    assert.equal(south.status, 0, south.stderr)
    const northTable = JSON.parse(north.stdout) as VariantTable
    const southTable = JSON.parse(south.stdout) as VariantTable
    const report = compareTables(northTable, southTable)
    assert.ok(report.mismatches.length >= 7)
    assert.deepEqual(report.matches, ["excitation_nm"])
  })
})

describe("selectCurrentBefore", () => {
  const versions: ProtocolVersionInterval[] = [
    {
      id: "v1",
      page_id: "N101",
      version: 1,
      valid_from: "2024-01-01",
      valid_to: "2025-06-01",
      source_dir: "wiki/v1"
    },
    {
      id: "v2",
      page_id: "N101",
      version: 2,
      valid_from: "2025-06-01",
      valid_to: null,
      source_dir: "wiki/v2"
    }
  ]

  it("picks the protocol version in force immediately before submission", () => {
    assert.equal(selectCurrentBefore(versions, "2025-11-01").id, "v2")
    assert.equal(selectCurrentBefore(versions, "2025-05-31").id, "v1")
    assert.equal(selectCurrentBefore(versions, "2025-06-01").id, "v2")
  })
})
