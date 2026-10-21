import { Effect, Layer } from "effect"
import type { BatchId, RunId } from "../domain/ids.ts"
import { Run } from "../domain/models.ts"
import { LNP_FORMULATION_AGENT_VERSION } from "../policy/lnp-qc.ts"
import type { LnpDraftProtocol } from "../protocol/lnp-draft.ts"
import { makeAgentCapabilityToken, stripProseForAgent } from "../security/capabilities.ts"
import { LnpFormulationAgent, type LnpFormulationAgentShape } from "./contracts.ts"

export const makeLnpFormulationAgent = (
  protocol: LnpDraftProtocol
): LnpFormulationAgentShape => ({
  token: makeAgentCapabilityToken("lnp_formulation", LNP_FORMULATION_AGENT_VERSION),
  planFormulationRun: (params) =>
    Effect.sync(() => {
      const request = stripProseForAgent(params.request)
      const selected =
        params.eligibleProtocols.find((item) => item.family === protocol.family) ??
        params.eligibleProtocols[0]
      if (!selected) {
        throw new Error("No eligible LNP protocol version was supplied to planFormulationRun.")
      }
      const body = request.id.slice("req_".length)
      const formulationRun = new Run({
        id: `run_${body}` as RunId,
        construct_id: params.payloadConstruct.id,
        batch_id: `bat_${body}` as BatchId,
        protocol_version_id: selected.id,
        parameter_bindings: {
          simulated: true,
          n_p_ratio: protocol.formulation.n_p_ratio,
          total_flow_rate_ml_min: protocol.formulation.total_flow_rate_ml_min,
          flow_rate_ratio_aqueous_to_organic:
            protocol.formulation.flow_rate_ratio_aqueous_to_organic
        },
        assignment_arm: "default",
        outcome: "pending",
        yield_mg: null,
        purity_pct: null,
        cost_units: 1,
        started_at: null,
        ended_at: null
      })
      return {
        formulationRun,
        selectedProtocolVersionId: selected.id
      }
    })
})

export const makeLnpFormulationAgentLayer = (protocol: LnpDraftProtocol) =>
  Layer.succeed(LnpFormulationAgent, makeLnpFormulationAgent(protocol))
