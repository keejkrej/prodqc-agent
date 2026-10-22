import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { evaluateEeFormulaError, evaluateInWellConcOutOfRange, loadRangeConfig } from "./checks.ts"
import { compareTables } from "./compare.ts"
import { extractFromPath } from "./extract.ts"
import { writeRoCrate } from "./ro-crate.ts"
import { datasetDatesForPublication, selectProtocolForMethods } from "./select-version.ts"
import type { LabOntology, MethodsVsWikiReport, ProtocolVersionInterval, VariantTable } from "./types.ts"

const usage = `usage:
  variant-table extract --lab <id> --assay ribogreen-ee --input <file-or-dir> [--out <file>]
  variant-table compare --left <table.json> --right <table.json> [--out <file>]
  variant-table methods-vs-wiki --methods <file-or-dir> --versions <index.json>
      [--ontology <graph.json> --publication <id>] [--submitted YYYY-MM-DD] [--out <file>]
  variant-table check --table <table.json> [--ranges <file>] [--out <file>]
  variant-table ro-crate --ontology <graph.json> --protocol <id> --out <dir>
`

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith("--")) return undefined
  return value
}

const requireFlag = (name: string): string => {
  const value = flag(name)
  if (!value) {
    process.stderr.write(`missing ${name}\n${usage}`)
    process.exit(1)
  }
  return value
}

const writeJson = (value: unknown, outPath: string | undefined): void => {
  const body = `${JSON.stringify(value, null, 2)}\n`
  if (!outPath) {
    process.stdout.write(body)
    return
  }
  mkdirSync(path.dirname(outPath), { recursive: true })
  writeFileSync(outPath, body)
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T

const extractCmd = (): void => {
  const table = extractFromPath({
    lab_id: requireFlag("--lab"),
    assay: flag("--assay") ?? "ribogreen-ee",
    inputPath: requireFlag("--input")
  })
  writeJson(table, flag("--out"))
}

const compareCmd = (): void => {
  const left = readJson<VariantTable>(requireFlag("--left"))
  const right = readJson<VariantTable>(requireFlag("--right"))
  writeJson(compareTables(left, right), flag("--out"))
}

const methodsVsWikiCmd = (): void => {
  const versionsPath = requireFlag("--versions")
  const index = readJson<{
    readonly lab_id: string
    readonly assay: string
    readonly versions: ProtocolVersionInterval[]
  }>(versionsPath)
  const ontologyPath = flag("--ontology")
  const publicationId = flag("--publication")
  const submitted = flag("--submitted")
  let datasetDates: string[] = []
  if (ontologyPath) {
    const graph = readJson<LabOntology>(ontologyPath)
    const pub = publicationId ?? graph.entities.publications[0]?.id
    if (!pub) {
      process.stderr.write("methods-vs-wiki: ontology has no publication\n")
      process.exit(1)
    }
    datasetDates = datasetDatesForPublication(graph, pub)
  }
  const selected = selectProtocolForMethods({
    versions: index.versions,
    datasetDates,
    submitted
  })
  const versionsRoot = path.dirname(versionsPath)
  const wikiTable = extractFromPath({
    lab_id: index.lab_id,
    assay: index.assay,
    inputPath: path.resolve(versionsRoot, selected.version.source_dir)
  })
  const methodsTable = extractFromPath({
    lab_id: flag("--lab") ?? "SYNTHETIC-paper",
    assay: index.assay,
    inputPath: requireFlag("--methods")
  })
  const compared = compareTables(methodsTable, wikiTable)
  const report: MethodsVsWikiReport = {
    ...compared,
    date_basis: selected.date_basis,
    as_of: selected.as_of,
    dataset_dates: selected.dataset_dates,
    ...(submitted ? { submission_date: submitted } : {}),
    selected_protocol_version: {
      id: selected.version.id,
      page_id: selected.version.page_id,
      version: selected.version.version,
      valid_from: selected.version.valid_from,
      valid_to: selected.version.valid_to
    }
  }
  writeJson(report, flag("--out"))
}

const checkCmd = (): void => {
  const table = readJson<VariantTable>(requireFlag("--table"))
  const ranges = flag("--ranges") ? loadRangeConfig(flag("--ranges")) : loadRangeConfig()
  writeJson(
    {
      ee_formula_error: evaluateEeFormulaError(table.fields.ee_formula?.value),
      in_well_conc_out_of_range: evaluateInWellConcOutOfRange(table, ranges)
    },
    flag("--out")
  )
}

const roCrateCmd = (): void => {
  const graph = readJson<LabOntology>(requireFlag("--ontology"))
  const written = writeRoCrate({
    graph,
    protocolId: requireFlag("--protocol"),
    outDir: requireFlag("--out")
  })
  process.stdout.write(`${written.metadataPath}\n`)
}

const command = process.argv[2]
if (command === "extract") extractCmd()
else if (command === "compare") compareCmd()
else if (command === "methods-vs-wiki") methodsVsWikiCmd()
else if (command === "check") checkCmd()
else if (command === "ro-crate") roCrateCmd()
else {
  process.stderr.write(usage)
  process.exit(command ? 1 : 0)
}
