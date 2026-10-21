import type { Rfc3339UtcTimestamp } from "../domain/ids.ts"
import type { LnpQcDispositionAction } from "../domain/models.ts"

/**
 * The QC policy only recommends. A named person must sign the record.
 */
export const DEFAULT_SIMULATED_SIGNER_NAME = "SIMULATED Dr. Ada Ng"

export class SignOffRequiresReasonError extends Error {
  readonly _tag = "SignOffRequiresReasonError"
  constructor() {
    super("A human override of an LNP QC recommendation requires a non-empty reason.")
    this.name = "SignOffRequiresReasonError"
  }
}

export type LnpHumanSignOffIntent =
  | { readonly outcome: "accepted" }
  | {
      readonly outcome: "overridden"
      readonly finalAction: LnpQcDispositionAction
      readonly reason: string
    }

export type LnpHumanSignOffRecord =
  | {
      readonly outcome: "accepted"
      readonly recommendedAction: LnpQcDispositionAction
      readonly finalAction: LnpQcDispositionAction
      readonly signerName: string
      readonly signedAt: Rfc3339UtcTimestamp
      readonly reason: null
      readonly simulated: true
    }
  | {
      readonly outcome: "overridden"
      readonly recommendedAction: LnpQcDispositionAction
      readonly finalAction: LnpQcDispositionAction
      readonly signerName: string
      readonly signedAt: Rfc3339UtcTimestamp
      readonly reason: string
      readonly simulated: true
    }

export const resolveSignerName = (
  argv: ReadonlyArray<string>,
  env: Record<string, string | undefined> = process.env
): string => {
  const flagIndex = argv.findIndex((arg) => arg === "--signer" || arg.startsWith("--signer="))
  if (flagIndex >= 0) {
    const flag = argv[flagIndex]
    const inline = flag?.startsWith("--signer=") ? flag.slice("--signer=".length) : undefined
    const separate = flag === "--signer" ? argv[flagIndex + 1] : undefined
    const fromFlag = (inline ?? separate ?? "").trim()
    if (fromFlag.length > 0) {
      return fromFlag
    }
  }
  const fromEnv = env["LNP_SIGNER_NAME"]?.trim()
  if (fromEnv) {
    return fromEnv
  }
  return DEFAULT_SIMULATED_SIGNER_NAME
}

export const makeHumanSignOff = (params: {
  readonly recommendedAction: LnpQcDispositionAction
  readonly intent: LnpHumanSignOffIntent
  readonly signerName: string
  readonly signedAt: Rfc3339UtcTimestamp
}): LnpHumanSignOffRecord => {
  const signerName = params.signerName.trim()
  if (signerName.length === 0) {
    throw new Error("Human sign-off requires a non-empty signer name.")
  }
  if (params.intent.outcome === "overridden") {
    const reason = params.intent.reason.trim()
    if (reason.length === 0) {
      throw new SignOffRequiresReasonError()
    }
    return {
      outcome: "overridden",
      recommendedAction: params.recommendedAction,
      finalAction: params.intent.finalAction,
      signerName,
      signedAt: params.signedAt,
      reason,
      simulated: true
    }
  }
  return {
    outcome: "accepted",
    recommendedAction: params.recommendedAction,
    finalAction: params.recommendedAction,
    signerName,
    signedAt: params.signedAt,
    reason: null,
    simulated: true
  }
}
