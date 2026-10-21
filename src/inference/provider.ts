import { Context, Effect, Layer } from "effect"

/**
 * Optional, pluggable model/inference provider.
 * The LNP QC disposition policy is rule-based and does not require this service.
 * The lab-pilot protocol drafting CLI does: it calls `infer` with the model key
 * from PROTOCOL_DRAFT_MODEL, then source-grounds every returned field.
 */
export interface InferenceProviderShape {
  readonly providerId: string
  readonly enabled: boolean
  readonly infer: (input: unknown) => Effect.Effect<unknown, Error>
}

export class InferenceProvider extends Context.Tag("prodqc-agent/InferenceProvider")<
  InferenceProvider,
  InferenceProviderShape
>() {}

export const DisabledInferenceProviderLive = Layer.succeed(InferenceProvider, {
  providerId: "none",
  enabled: false,
  infer: () =>
    Effect.fail(
      new Error(
        "InferenceProvider is optional and disabled; LNP QC uses the deterministic rule-based policy."
      )
    )
})
