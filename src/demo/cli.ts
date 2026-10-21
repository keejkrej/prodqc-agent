import { Effect } from "effect"
import { runDemoBatches, runSimulatedOverrideExample } from "./lnp-batch.ts"
import { formatDemoOutput } from "./narrative.ts"
import { loadLnpDraftProtocol } from "../protocol/lnp-draft.ts"
import { resolveSignerName } from "../policy/lnp-sign-off.ts"

const HELP = `SIMULATED LNP formulation demo
The agent recommends. A named person signs.

Usage:
  npm run demo:lnp -- [--signer <name>]
  LNP_SIGNER_NAME=<name> npm run demo:lnp

--signer / LNP_SIGNER_NAME  Human signer display name
Default: SIMULATED Dr. Ada Ng
`

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(HELP)
  process.exit(0)
}

const main = Effect.gen(function* () {
  const signerName = resolveSignerName(process.argv.slice(2))
  const protocol = yield* loadLnpDraftProtocol(process.env["LNP_PROTOCOL_PATH"])
  const { screening, inVivo } = yield* runDemoBatches(protocol, signerName)
  const overrideExample = yield* runSimulatedOverrideExample(protocol, signerName)
  return formatDemoOutput({ screening, inVivo, overrideExample })
})

const output = await Effect.runPromise(main)
process.stdout.write(output)
