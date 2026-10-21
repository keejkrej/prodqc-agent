import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { extractRibogreen } from "./ribogreen.ts"
import type { SourceDocument, VariantTable } from "./types.ts"

const listMarkdown = (root: string): string[] => {
  const stats = statSync(root)
  if (stats.isFile()) {
    if (!root.endsWith(".md")) {
      throw new Error(`extract: expected a .md file, got ${root}`)
    }
    return [root]
  }
  const found: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const next = path.join(root, entry.name)
    if (entry.isDirectory()) found.push(...listMarkdown(next))
    else if (entry.isFile() && entry.name.endsWith(".md")) found.push(next)
  }
  return found.sort()
}

export const loadSources = (inputPath: string): SourceDocument[] =>
  listMarkdown(inputPath).map((file) => ({
    file,
    text: readFileSync(file, "utf8")
  }))

export const extractFromPath = (params: {
  readonly lab_id: string
  readonly assay: string
  readonly inputPath: string
}): VariantTable => {
  if (params.assay !== "ribogreen-ee") {
    throw new Error(`extract: unsupported assay ${params.assay}`)
  }
  const sources = loadSources(params.inputPath)
  if (sources.length === 0) {
    throw new Error(`extract: no markdown files under ${params.inputPath}`)
  }
  return extractRibogreen({ lab_id: params.lab_id, sources })
}
