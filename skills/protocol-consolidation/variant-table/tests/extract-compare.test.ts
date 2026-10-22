import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  EE_FORMULA_MESSAGES,
  evaluateEeFormulaError,
  evaluateInWellConcOutOfRange,
  loadRangeConfig
} from "../src/checks.ts"
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
    assert.equal(table.fields.dye_dilution?.value, "1:200")
    assert.equal(table.fields.triton_standard_curve?.value, true)
    assert.equal(table.fields.triton_final_conc_pct?.value, 0.5)
    assert.equal(table.fields.curve_well_volume_uL?.value, 100)
    assert.equal(table.fields.lysis_time_min?.value, 10)
    assert.equal(table.fields.lysis_temperature_C?.value, 37)
    assert.equal(table.fields.dye_incubation_time_min?.value, 5)
    assert.equal(table.fields.dye_incubation_light?.value, "dark")
    assert.equal(table.fields.triton_blank?.value, true)
    assert.equal(table.fields.water_blank?.value, true)
    assert.equal(table.fields.sample_dilution_ug_per_mL?.value, 0.5)
    assert.equal(table.fields.in_well_rna_ug_per_mL?.value, 0.4)
    assert.equal(table.fields.ee_formula?.value, "1-(free/total)")
    assert.equal(table.fields.excitation_nm?.value, 485)
    assert.equal(table.fields.emission_nm?.value, 530)
  })

  it("extracts Lab South, including inverted EE formula and light incubation", () => {
    const table = extractFromPath({
      lab_id: "SYNTHETIC-lab-south",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtures, "SYNTHETIC-lab-south")
    })
    assert.equal(table.fields.dye_dilution?.value, "1:100")
    assert.equal(table.fields.triton_standard_curve?.value, false)
    assert.equal(table.fields.lysis_time_min?.value, 15)
    assert.equal(table.fields.dye_incubation_light?.value, "light")
    assert.equal(table.fields.triton_blank?.value, false)
    assert.equal(table.fields.ee_formula?.value, "total/free")
    assert.equal(table.fields.in_well_rna_ug_per_mL?.value, 2)
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
    assert.equal(table.fields.ee_formula?.value, "1-(free/total)")
    assert.equal(table.fields.dye_dilution, undefined)
    assert.equal(table.fields.lysis_time_min, undefined)
  })

  it("extracts the existing synthetic walkthrough versions without inventing unread fields", () => {
    const v1 = extractFromPath({
      lab_id: "SYNTHETIC-v1",
      assay: "ribogreen-ee",
      inputPath: path.join(exampleVersions, "SYNTHETIC-v1.md")
    })
    assert.equal(v1.fields.dye_dilution?.value, "1:100")
    assert.equal(v1.fields.triton_standard_curve?.value, false)
    assert.equal(v1.fields.ee_formula?.value, "total/free")
    assert.equal(v1.fields.lysis_time_min, undefined)
    assert.equal(v1.fields.dye_incubation_time_min, undefined)
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
    assert.ok(report.matches.includes("excitation_nm"))
    assert.ok(report.matches.includes("water_blank"))
    assert.equal(byField["dye_dilution"]?.left?.value, "1:200")
    assert.equal(byField["ee_formula"]?.right?.value, "total/free")
    assert.equal(byField["dye_incubation_light"]?.left?.value, "dark")
    assert.equal(byField["dye_incubation_light"]?.right?.value, "light")
    assert.equal(byField["lysis_time_min"]?.left?.value, 10)
    assert.equal(byField["lysis_time_min"]?.right?.value, 15)
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
        dye_incubation_time_min: { value: 5, source: { file: "b.md", line: 2 } }
      }
    }
    const report = compareTables(left, right)
    assert.deepEqual(
      report.mismatches.map((row) => row.kind),
      ["missing_right", "missing_left"]
    )
  })
})

describe("ee-formula-error and in-well-conc-out-of-range", () => {
  it("uses distinct messages for inverted vs leak-fraction formulae", () => {
    const inverted = evaluateEeFormulaError("total/free")
    const leak = evaluateEeFormulaError("free/total")
    const ok = evaluateEeFormulaError("1-(free/total)")
    assert.equal(inverted.result, "hit")
    assert.equal(inverted.kind, "inverted")
    assert.equal(inverted.message, EE_FORMULA_MESSAGES.inverted)
    assert.equal(leak.result, "hit")
    assert.equal(leak.kind, "leak_fraction")
    assert.equal(leak.message, EE_FORMULA_MESSAGES.leak_fraction)
    assert.notEqual(inverted.message, leak.message)
    assert.equal(ok.result, "clear")
  })

  it("flags in-well RNA outside the configured 1:200 high-range", () => {
    const ranges = loadRangeConfig()
    assert.equal(ranges.ranges["1:200"]?.max, 1.0)
    const hit = extractRibogreen({
      lab_id: "SYNTHETIC-high",
      sources: [
        {
          file: "high.md",
          text: "Working dye dilution: 1:200.\nIn-well RNA: 2 ug/mL."
        }
      ]
    })
    const result = evaluateInWellConcOutOfRange(hit, ranges)
    assert.equal(result.result, "hit")
    assert.match(result.message ?? "", /outside/)
    const north = extractFromPath({
      lab_id: "SYNTHETIC-lab-north",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtures, "SYNTHETIC-lab-north")
    })
    assert.equal(evaluateInWellConcOutOfRange(north, ranges).result, "clear")
    const south = extractFromPath({
      lab_id: "SYNTHETIC-lab-south",
      assay: "ribogreen-ee",
      inputPath: path.join(fixtures, "SYNTHETIC-lab-south")
    })
    assert.equal(evaluateInWellConcOutOfRange(south, ranges).result, "unknown")
  })
})

describe("variant-table CLI", () => {
  it("runs check on an inverted formula and an out-of-range in-well concentration", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vt-check-"))
    const tablePath = path.join(dir, "table.json")
    writeFileSync(
      tablePath,
      JSON.stringify({
        lab_id: "SYNTHETIC-check",
        assay: "ribogreen-ee",
        fields: {
          dye_dilution: { value: "1:200", source: { file: "c.md", line: 1 } },
          in_well_rna_ug_per_mL: { value: 2, source: { file: "c.md", line: 2 } },
          ee_formula: { value: "free/total", source: { file: "c.md", line: 3 } }
        }
      })
    )
    try {
      const result = extractCli(["check", "--table", tablePath])
      assert.equal(result.status, 0, result.stderr)
      const body = JSON.parse(result.stdout) as {
        ee_formula_error: { result: string; kind?: string }
        in_well_conc_out_of_range: { result: string }
      }
      assert.equal(body.ee_formula_error.result, "hit")
      assert.equal(body.ee_formula_error.kind, "leak_fraction")
      assert.equal(body.in_well_conc_out_of_range.result, "hit")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("extracts and compares via the CLI into a mismatch report", () => {
    const north = extractCli([
      "extract",
      "--lab",
      "SYNTHETIC-lab-north",
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
    const report = compareTables(
      JSON.parse(north.stdout) as VariantTable,
      JSON.parse(south.stdout) as VariantTable
    )
    assert.ok(report.mismatches.length >= 7)
    assert.ok(report.matches.includes("excitation_nm"))
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

  it("picks the protocol version in force on a date", () => {
    assert.equal(selectCurrentBefore(versions, "2025-11-01").id, "v2")
    assert.equal(selectCurrentBefore(versions, "2025-05-31").id, "v1")
  })
})
