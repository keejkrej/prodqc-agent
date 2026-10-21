import { Effect, Layer } from "effect"
import { InferenceProvider } from "../inference/provider.ts"
import { extractDraftFields, type ExtractedDraftFields } from "./extract.ts"
import type { LoadedSourceDocument } from "./source-text.ts"

export const PROTOCOL_DRAFT_MODEL_ENV = "PROTOCOL_DRAFT_MODEL"
export const PROTOCOL_DRAFT_INFER_URL_ENV = "PROTOCOL_DRAFT_INFER_URL"
export const PROTOCOL_DRAFT_INFER_TASK = "draft_protocol"

export class ProtocolDraftModelMissingError extends Error {
  readonly _tag = "ProtocolDraftModelMissingError"
  constructor() {
    super(
      `Set ${PROTOCOL_DRAFT_MODEL_ENV} to the inference model key. The lab-pilot CLI does not pick a silent default for live drafting.`
    )
    this.name = "ProtocolDraftModelMissingError"
  }
}

export const resolveProtocolDraftModel = (
  env: Record<string, string | undefined> = process.env
): string => {
  const model = env[PROTOCOL_DRAFT_MODEL_ENV]?.trim()
  if (!model) {
    throw new ProtocolDraftModelMissingError()
  }
  return model
}

export interface ProtocolDraftInferInput {
  readonly task: typeof PROTOCOL_DRAFT_INFER_TASK
  readonly model: string
  readonly filename: string
  readonly lines: LoadedSourceDocument["lines"]
  readonly document: LoadedSourceDocument
}

export const isProtocolDraftInferInput = (input: unknown): input is ProtocolDraftInferInput => {
  if (typeof input !== "object" || input === null) {
    return false
  }
  const record = input as Partial<ProtocolDraftInferInput>
  return record.task === PROTOCOL_DRAFT_INFER_TASK && typeof record.model === "string"
}

/**
 * Source-grounded extractor behind InferenceProvider.
 * Used for synthetic fixtures and as the no-HTTP fallback.
 * A later HTTP model adapter can replace this Layer; grounding still runs after infer().
 */
export const GroundedProtocolDraftInferenceLive = Layer.succeed(InferenceProvider, {
  providerId: "grounded-source-extractor",
  enabled: true,
  infer: (input: unknown) =>
    Effect.try({
      try: () => {
        if (!isProtocolDraftInferInput(input)) {
          throw new Error("InferenceProvider received an unexpected protocol-draft payload.")
        }
        return extractDraftFields(input.document)
      },
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
    })
})

export const makeHttpProtocolDraftInferenceLayer = (url: string): Layer.Layer<InferenceProvider> =>
  Layer.succeed(InferenceProvider, {
    providerId: "http-protocol-draft",
    enabled: true,
    infer: (input: unknown) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input)
          })
          if (!response.ok) {
            throw new Error(`PROTOCOL_DRAFT_INFER_URL responded ${response.status}`)
          }
          return (await response.json()) as unknown
        },
        catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause)))
      })
  })

export const makeProtocolDraftInferenceLayer = (
  env: Record<string, string | undefined> = process.env
): Layer.Layer<InferenceProvider> => {
  const url = env[PROTOCOL_DRAFT_INFER_URL_ENV]?.trim()
  if (url) {
    return makeHttpProtocolDraftInferenceLayer(url)
  }
  return GroundedProtocolDraftInferenceLive
}

export const inferProtocolDraft = (
  model: string,
  document: LoadedSourceDocument
): Effect.Effect<ExtractedDraftFields, Error, InferenceProvider> =>
  Effect.gen(function* () {
    const provider = yield* InferenceProvider
    const raw = yield* provider.infer({
      task: PROTOCOL_DRAFT_INFER_TASK,
      model,
      filename: document.basename,
      lines: document.lines,
      document
    } satisfies ProtocolDraftInferInput)
    return raw as ExtractedDraftFields
  })
