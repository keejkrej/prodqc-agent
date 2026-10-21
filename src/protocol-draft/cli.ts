import path from "node:path"
import { Effect } from "effect"
import {
  makeProtocolDraftInferenceLayer,
  resolveProtocolDraftModel,
  PROTOCOL_DRAFT_MODEL_ENV,
  PROTOCOL_DRAFT_INFER_URL_ENV
} from "./inference.ts"
import { runProtocolDrafting } from "./run.ts"

const HELP = `Lab-pilot protocol drafting CLI
Not the full migration pipeline.

Reads 2–5 versions of one protocol from a local folder (txt/md, or PDF with
text extraction). Drafts each version into the existing protocols/*.draft.json
schema (Effect Schema, draft: true). Every kept field points at the source
line it was read from. The CLI never invents unread values; uncertain items
become open questions. Observation-gated steps such as "until clear" are kept
as gates/branches, not flattened to one path. Units are UCUM.

Privacy: put real protocols in input/ and write to output/. Those folders are
gitignored. Do not commit real protocol inputs or outputs.

Usage:
  ${PROTOCOL_DRAFT_MODEL_ENV}=<model-key> npm run draft:protocol -- --input <dir> --output <dir>
  npm run draft:protocol:fixtures
  npm run draft:protocol:fixtures -- --summary-only
  npm run draft:protocol:fixtures -- --summary-only --review fixtures/protocol-draft/SYNTHETIC-colleague-review.json

Flags:
  --input <dir>     Folder with 2–5 protocol versions (default: input)
  --output <dir>    Destination for *.draft.json, comparison.md, pitch-summary.json
  --summary-only    Print counts only (safe for a pitch slide): versions, steps
                    per version, differences by category, open questions by
                    category, review corrections. No protocol text, values, or names.
  --review <file>   Optional colleague review JSON { items: [{ outcome }] }.
                    Outcomes: corrected | accepted | deferred. Extra keys ignored.
  --help

Env:
  ${PROTOCOL_DRAFT_MODEL_ENV}     Required model key passed to InferenceProvider
  ${PROTOCOL_DRAFT_INFER_URL_ENV} Optional HTTP infer endpoint; otherwise the
                              grounded source extractor Layer is used
`

const flagValue = (argv: ReadonlyArray<string>, name: string): string | undefined => {
  const index = argv.findIndex((arg) => arg === name || arg.startsWith(`${name}=`))
  if (index < 0) {
    return undefined
  }
  const token = argv[index]
  if (token?.startsWith(`${name}=`)) {
    return token.slice(name.length + 1)
  }
  return argv[index + 1]
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(HELP)
  process.exit(0)
}

const argv = process.argv.slice(2)
const inputDir = path.resolve(process.cwd(), flagValue(argv, "--input") ?? "input")
const outputDir = path.resolve(process.cwd(), flagValue(argv, "--output") ?? "output")
const reviewFlag = flagValue(argv, "--review")
const reviewPath = reviewFlag ? path.resolve(process.cwd(), reviewFlag) : undefined
const summaryOnly = argv.includes("--summary-only")

const main = Effect.gen(function* () {
  const model = resolveProtocolDraftModel()
  const result = yield* runProtocolDrafting(
    inputDir,
    outputDir,
    model,
    reviewPath ? { reviewPath } : {}
  )
  if (summaryOnly) {
    return result.summaryText
  }
  const summary = [
    "Lab-pilot protocol drafting complete.",
    `Model: ${model}`,
    `Drafts: ${result.draftPaths.length}`,
    ...result.drafts.map(
      (draft) =>
        `  ${draft.source_document.file} -> ${draft.protocol_id}  open_questions=${draft.open_questions.length} invented_rejected=${draft.invented_values_rejected}`
    ),
    `Report: ${result.reportPath}`,
    `Pitch summary: ${result.summaryPath}`,
    "The agent drafts. A colleague reviews the one-page comparison.",
    "Use --summary-only for a counts-only pitch slide (no protocol text).",
    "Do not commit real protocol inputs or outputs.",
    ""
  ].join("\n")
  return summary
}).pipe(Effect.provide(makeProtocolDraftInferenceLayer()))

const output = await Effect.runPromise(main)
process.stdout.write(output)
