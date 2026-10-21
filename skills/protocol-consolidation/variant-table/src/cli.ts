import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { compareTables } from "./compare.ts"
import { extractFromPath } from "./extract.ts"
import { selectCurrentBefore } from "./select-version.ts"
import type { MethodsVsWikiReport, ProtocolVersionInterval, VariantTable } from "./types.ts"

const usage = `usage:
  variant-table extract --lab <id> --assay ribogreen-ee --input <file-or-dir> [--out <file>]
  variant-table compare --left <table.json> --right <table.json> [--out <file>]
  variant-table methods-vs-wiki --methods <file-or-dir> --versions <index.json> --submitted YYYY-MM-DD [--out <file>]
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
  const submitted = requireFlag("--submitted")
  const index = readJson<{
    readonly lab_id: string
    readonly assay: string
    readonly versions: ProtocolVersionInterval[]
  }>(versionsPath)
  const selected = selectCurrentBefore(index.versions, submitted)
  const versionsRoot = path.dirname(versionsPath)
  const wikiTable = extractFromPath({
    lab_id: index.lab_id,
    assay: index.assay,
    inputPath: path.resolve(versionsRoot, selected.source_dir)
  })
  const methodsTable = extractFromPath({
    lab_id: flag("--lab") ?? "SYNTHETIC-paper",
    assay: index.assay,
    inputPath: requireFlag("--methods")
  })
  const compared = compareTables(methodsTable, wikiTable)
  const report: MethodsVsWikiReport = {
    ...compared,
    submission_date: submitted,
    selected_protocol_version: {
      id: selected.id,
      page_id: selected.page_id,
      version: selected.version,
      valid_from: selected.valid_from,
      valid_to: selected.valid_to
    }
  }
  writeJson(report, flag("--out"))
}

const command = process.argv[2]
if (command === "extract") extractCmd()
else if (command === "compare") compareCmd()
else if (command === "methods-vs-wiki") methodsVsWikiCmd()
else {
  process.stderr.write(usage)
  process.exit(command ? 1 : 0)
}
