import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { extractPdfText } from "./pdf.ts"

export const PROTOCOL_SOURCE_EXTENSIONS = [".txt", ".md", ".pdf"] as const

export interface SourceLine {
  readonly line: number
  readonly text: string
}

export interface LoadedSourceDocument {
  readonly file: string
  readonly basename: string
  readonly sha256: string
  readonly text: string
  readonly lines: ReadonlyArray<SourceLine>
}

const isProtocolSourceName = (name: string): boolean => {
  const ext = path.extname(name).toLowerCase()
  return (PROTOCOL_SOURCE_EXTENSIONS as readonly string[]).includes(ext)
}

export const splitLines = (text: string): ReadonlyArray<SourceLine> =>
  text.split(/\r?\n/).map((textLine, index) => ({
    line: index + 1,
    text: textLine
  }))

export const loadSourceBytes = (filePath: string, bytes: Uint8Array): LoadedSourceDocument => {
  const ext = path.extname(filePath).toLowerCase()
  const text =
    ext === ".pdf" ? extractPdfText(bytes) : Buffer.from(bytes).toString("utf8")
  const sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`
  return {
    file: filePath,
    basename: path.basename(filePath),
    sha256,
    text,
    lines: splitLines(text)
  }
}

export const loadSourceFile = async (filePath: string): Promise<LoadedSourceDocument> => {
  const bytes = await readFile(filePath)
  return loadSourceBytes(filePath, bytes)
}

export class ProtocolSourceCountError extends Error {
  readonly _tag = "ProtocolSourceCountError"
  constructor(message: string) {
    super(message)
    this.name = "ProtocolSourceCountError"
  }
}

export const listProtocolSourceFiles = async (
  inputDir: string
): Promise<ReadonlyArray<string>> => {
  const entries = await readdir(inputDir, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && isProtocolSourceName(entry.name) && !entry.name.startsWith("."))
    .map((entry) => path.join(inputDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
  if (files.length < 2 || files.length > 5) {
    throw new ProtocolSourceCountError(
      `Expected 2–5 protocol versions in ${inputDir}, found ${files.length}. This CLI is a lab-pilot drafter, not a full migration pipeline.`
    )
  }
  return files
}

export const loadProtocolSources = async (
  inputDir: string
): Promise<ReadonlyArray<LoadedSourceDocument>> => {
  const files = await listProtocolSourceFiles(inputDir)
  return Promise.all(files.map((file) => loadSourceFile(file)))
}

export const looksSynthetic = (doc: LoadedSourceDocument): boolean =>
  /synthetic/i.test(doc.basename) ||
  doc.lines.slice(0, 8).some((row) => /synthetic/i.test(row.text))
