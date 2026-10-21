import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { extractFromPath } from "../src/extract.ts"
import type { VariantTable } from "../src/types.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtures = path.join(here, "../fixtures")

const LEAK_TOKENS = [
  "NORTH-LEAK-TOKEN-QUASAR-7F3",
  "SOUTH-LEAK-TOKEN-NIMBUS-9K1",
  "PAPER-LEAK-TOKEN-ORBIT-4M2",
  "keep the north-bay carton on the top shelf until the dye looks even",
  "south-bay operator notebook remnant",
  "must stay on this page",
  "fictional method fragment",
  "fictional methods section",
  "lab notebook aside",
  "Not a lab protocol"
]

const ALLOWED_EXPORT_KEYS = new Set([
  "lab_id",
  "assay",
  "fields",
  "value",
  "source",
  "file",
  "line",
  "dye_dilution",
  "triton_standard_curve",
  "curve_well_volume_uL",
  "sample_well_volume_uL",
  "incubation_time_min",
  "incubation_temperature_C",
  "ee_formula",
  "excitation_nm",
  "emission_nm"
])

const markdownFiles = (root: string): string[] => {
  const stats = statSync(root)
  if (stats.isFile()) return root.endsWith(".md") ? [root] : []
  const found: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const next = path.join(root, entry.name)
    if (entry.isDirectory()) found.push(...markdownFiles(next))
    else if (entry.isFile() && entry.name.endsWith(".md")) found.push(next)
  }
  return found
}

const sourceSentences = (text: string): string[] =>
  text
    .split(/[\n.]+/)
    .map((part) => part.trim())
    .filter((part) => part.split(/\s+/).length >= 6)

const collectKeys = (value: unknown, keys: Set<string>): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys)
    return
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key)
      collectKeys(child, keys)
    }
  }
}

const assertNoSourceProse = (table: VariantTable, sourceRoot: string): void => {
  const exported = JSON.stringify(table)
  assert.equal("excerpt" in table, false)
  assert.equal("notes" in table, false)
  assert.match(exported, /"source":\{"file":/)
  assert.doesNotMatch(exported, /"excerpt"/)
  assert.doesNotMatch(exported, /"notes"/)
  assert.doesNotMatch(exported, /"body"/)

  for (const token of LEAK_TOKENS) {
    assert.equal(
      exported.includes(token),
      false,
      `exported table leaked source token: ${token}`
    )
  }

  for (const file of markdownFiles(sourceRoot)) {
    const text = readFileSync(file, "utf8")
    for (const sentence of sourceSentences(text)) {
      assert.equal(
        exported.includes(sentence),
        false,
        `exported table contained source sentence from ${path.basename(file)}: ${sentence}`
      )
    }
  }

  const keys = new Set<string>()
  collectKeys(table, keys)
  for (const key of keys) {
    assert.equal(ALLOWED_EXPORT_KEYS.has(key), true, `unexpected export key ${key}`)
  }
}

describe("variant-table export contains no source-page free text", () => {
  it("Lab North export is a field table only", () => {
    const root = path.join(fixtures, "SYNTHETIC-lab-north")
    const table = extractFromPath({
      lab_id: "SYNTHETIC-lab-north",
      assay: "ribogreen-ee",
      inputPath: root
    })
    assertNoSourceProse(table, root)
  })

  it("Lab South export is a field table only", () => {
    const root = path.join(fixtures, "SYNTHETIC-lab-south")
    const table = extractFromPath({
      lab_id: "SYNTHETIC-lab-south",
      assay: "ribogreen-ee",
      inputPath: root
    })
    assertNoSourceProse(table, root)
  })

  it("paper methods export is a field table only", () => {
    const root = path.join(fixtures, "methods-vs-wiki/paper")
    const table = extractFromPath({
      lab_id: "SYNTHETIC-paper",
      assay: "ribogreen-ee",
      inputPath: root
    })
    assertNoSourceProse(table, root)
  })
})
