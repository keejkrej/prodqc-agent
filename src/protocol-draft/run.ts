import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { InferenceProvider } from "../inference/provider.ts"
import { assembleSourcedDraft } from "./assemble.ts"
import { compareDraftedProtocols } from "./compare.ts"
import { inferProtocolDraft } from "./inference.ts"
import { encodeSourcedDraftProtocolSync, type SourcedDraftProtocol } from "./schema.ts"
import { loadProtocolSources } from "./source-text.ts"
import { formatComparisonReport } from "./report.ts"

export interface ProtocolDraftRunResult {
  readonly drafts: ReadonlyArray<SourcedDraftProtocol>
  readonly reportMarkdown: string
  readonly outputDir: string
  readonly draftPaths: ReadonlyArray<string>
  readonly reportPath: string
}

const draftFileName = (draft: SourcedDraftProtocol): string => {
  const stem = draft.source_document.file.replace(/\.[^.]+$/, "")
  return `${stem}.draft.json`
}

export const runProtocolDrafting = (
  inputDir: string,
  outputDir: string,
  model: string
): Effect.Effect<ProtocolDraftRunResult, Error, InferenceProvider> =>
  Effect.gen(function* () {
    const sources = yield* Effect.tryPromise({
      try: () => loadProtocolSources(inputDir),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
    })
    const drafts: SourcedDraftProtocol[] = []
    for (const document of sources) {
      const extracted = yield* inferProtocolDraft(model, document)
      drafts.push(assembleSourcedDraft({ model, document, extracted }))
    }
    const reportMarkdown = formatComparisonReport(compareDraftedProtocols(drafts))

    yield* Effect.tryPromise({
      try: () => mkdir(outputDir, { recursive: true }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
    })

    const draftPaths: string[] = []
    for (const draft of drafts) {
      const filePath = path.join(outputDir, draftFileName(draft))
      const encoded = encodeSourcedDraftProtocolSync(draft)
      yield* Effect.tryPromise({
        try: () => writeFile(filePath, `${JSON.stringify(encoded, null, 2)}\n`, "utf8"),
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
      })
      draftPaths.push(filePath)
    }
    const reportPath = path.join(outputDir, "comparison.md")
    yield* Effect.tryPromise({
      try: () => writeFile(reportPath, reportMarkdown, "utf8"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
    })

    return { drafts, reportMarkdown, outputDir, draftPaths, reportPath }
  })
