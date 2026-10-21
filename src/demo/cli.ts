import { Effect } from "effect"
import { runDemoBatches } from "./lnp-batch.ts"
import { formatDemoOutput } from "./narrative.ts"
import { loadLnpDraftProtocol } from "../protocol/lnp-draft.ts"

const main = Effect.gen(function* () {
  const protocol = yield* loadLnpDraftProtocol(process.env["LNP_PROTOCOL_PATH"])
  const batches = yield* runDemoBatches(protocol)
  return formatDemoOutput(batches)
})

const output = await Effect.runPromise(main)
process.stdout.write(output)
