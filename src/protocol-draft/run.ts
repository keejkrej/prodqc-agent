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
import { emptyReviewCounts, loadReviewCounts } from "./review.ts"
import { buildPitchSummary, formatPitchSummary, type PitchSummary } from "./summary.ts"

export interface ProtocolDraftRunOptions {
  readonly reviewPath?: string
}

export interface ProtocolDraftRunResult {
  readonly drafts: ReadonlyArray<SourcedDraftProtocol>
  readonly reportMarkdown: string
  readonly summary: PitchSummary
  readonly summaryText: string
  readonly outputDir: string
  readonly draftPaths: ReadonlyArray<string>
  readonly reportPath: string
  readonly summaryPath: string
}

const draftFileName = (draft: SourcedDraftProtocol): string => {
  const stem = draft.source_document.file.replace(/\.[^.]+$/, "")
  return `${stem}.draft.json`
}

export const runProtocolDrafting = (
  inputDir: string,
  outputDir: string,
  model: string,
  options: ProtocolDraftRunOptions = {}
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
    const reviewPath = options.reviewPath
    const review = reviewPath
      ? yield* Effect.tryPromise({
          try: () => loadReviewCounts(reviewPath),
          catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
        })
      : emptyReviewCounts()
    const summary = buildPitchSummary(drafts, review)
    const summaryText = formatPitchSummary(summary)
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
    const summaryPath = path.join(outputDir, "pitch-summary.json")
    yield* Effect.tryPromise({
      try: () => writeFile(reportPath, reportMarkdown, "utf8"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
    })
    yield* Effect.tryPromise({
      try: () => writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8"),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
    })

    return {
      drafts,
      reportMarkdown,
      summary,
      summaryText,
      outputDir,
      draftPaths,
      reportPath,
      summaryPath
    }
  })
