import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { Effect, Schema } from "effect"
import {
  decideLnpQc,
  decodeLnpDraftProtocolSync,
  LnpDraftProtocol,
  type LnpQcEvidence
} from "../src/index.ts"

const protocol = decodeLnpDraftProtocolSync(
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), "protocols/lnp-microfluidic-mixing.draft.json"),
      "utf8"
    )
  )
)

const scenarioEvidence: LnpQcEvidence = {
  dlsT0ZAvgNm: 94,
  dlsT0Pdi: 0.21,
  ribogreenEePct: 87,
  dlsT24hZAvgNm: 101
}

const decide = (study: "screening" | "in_vivo", evidence: LnpQcEvidence = scenarioEvidence) =>
  decideLnpQc({
    protocol,
    downstreamStudyType: study,
    evidence,
    decidedAt: "2026-11-04T10:15:00Z" as Parameters<typeof decideLnpQc>[0]["decidedAt"],
    operatorId: "user_01LNPOPR000000000000000001" as Parameters<
      typeof decideLnpQc
    >[0]["operatorId"]
  })

describe("LNP QC disposition policy (deterministic, no LLM)", () => {
  it("loads the DRAFT protocol file through Effect Schema", () => {
    assert.equal(protocol.draft, true)
    assert.equal(protocol.schema_version, "0.1.0-draft")
    assert.equal(protocol.simulation.label, "ALL VALUES SIMULATED")
    assert.equal(protocol.release_specs.dls_pdi_max, 0.2)
    assert.equal(protocol.release_specs.ribogreen_ee_pct_min, 90)
    assert.equal(protocol.decision_points.qc_disposition.rule_id, "lnp_qc_disposition_v0_draft")
    const roundTrip = Schema.decodeUnknownSync(LnpDraftProtocol)(JSON.parse(JSON.stringify(protocol)))
    assert.equal(roundTrip.protocol_id, protocol.protocol_id)
  })

  it("rejects a protocol document that drops required specs", () => {
    const invalid = { ...protocol, release_specs: { dls_pdi_max: 0.2 } }
    assert.throws(() => decodeLnpDraftProtocolSync(invalid))
  })

  it("classifies the SIMULATED pitch batch as borderline and uses-with-note for screening", () => {
    const decision = decide("screening")
    assert.equal(decision.simulated, true)
    assert.equal(decision.classification, "borderline")
    assert.equal(decision.borderlineBatch, true)
    assert.equal(decision.specMissSummary.specsEvaluated, 4)
    assert.equal(decision.specMissSummary.specsMissed, 3)
    assert.equal(decision.specMissSummary.allMissesWithinBorderlineBand, true)
    assert.equal(
      decision.specMissSummary.text,
      "3 of 4 specs missed, all within the borderline band"
    )
    assert.equal(decision.action, "use_with_note")
    assert.equal(decision.evidence.pdi.status, "borderline_miss")
    assert.equal(decision.evidence.eePct.status, "borderline_miss")
    assert.equal(decision.evidence.sizeDriftNm.status, "borderline_miss")
    assert.equal(decision.evidence.sizeDriftNm.value, 7)
    assert.equal(decision.evidence.zAvgT0.status, "in_spec")
    assert.equal(decision.evidence.zAvgT24h.status, "in_spec")
    assert.equal(decision.thresholds.pdiMax, 0.2)
    assert.equal(decision.thresholds.eePctMin, 90)
    assert.equal(decision.thresholds.sizeDriftNmMax, 5)
    assert.match(decision.ruleApplied, /screening\.borderline -> use_with_note/)
    assert.equal(decision.actor.agentRole, "lnp_formulation")
  })

  it("remakes the same SIMULATED borderline batch for an in vivo work order", () => {
    const decision = decide("in_vivo")
    assert.equal(decision.classification, "borderline")
    assert.equal(decision.borderlineBatch, true)
    assert.equal(decision.action, "remake")
    assert.match(decision.ruleApplied, /in_vivo\.borderline -> remake/)
  })

  it("releases an in-spec SIMULATED batch for either downstream use", () => {
    const inSpec: LnpQcEvidence = {
      dlsT0ZAvgNm: 90,
      dlsT0Pdi: 0.18,
      ribogreenEePct: 92,
      dlsT24hZAvgNm: 91
    }
    const screening = decide("screening", inSpec)
    const inVivo = decide("in_vivo", inSpec)
    assert.equal(screening.classification, "in_spec")
    assert.equal(screening.borderlineBatch, false)
    assert.equal(screening.specMissSummary.text, "0 of 4 specs missed")
    assert.equal(screening.action, "release_for_cell_experiment")
    assert.equal(inVivo.action, "release_for_cell_experiment")
  })

  it("remakes a hard-fail SIMULATED batch even for screening", () => {
    const hardFail: LnpQcEvidence = {
      dlsT0ZAvgNm: 94,
      dlsT0Pdi: 0.4,
      ribogreenEePct: 70,
      dlsT24hZAvgNm: 130
    }
    const decision = decide("screening", hardFail)
    assert.equal(decision.classification, "hard_fail")
    assert.equal(decision.action, "remake")
    assert.equal(decision.evidence.pdi.status, "hard_fail")
    assert.equal(decision.evidence.eePct.status, "hard_fail")
    assert.equal(decision.evidence.sizeDriftNm.status, "hard_fail")
    assert.equal(decision.specMissSummary.specsMissed, 3)
    assert.equal(decision.specMissSummary.allMissesWithinBorderlineBand, false)
    assert.equal(decision.specMissSummary.text, "3 of 4 specs missed")
  })

  it("computes a one-spec miss summary from the actual results", () => {
    const decision = decide("screening", {
      dlsT0ZAvgNm: 90,
      dlsT0Pdi: 0.21,
      ribogreenEePct: 92,
      dlsT24hZAvgNm: 91
    })
    assert.equal(
      decision.specMissSummary.text,
      "1 of 4 specs missed, all within the borderline band"
    )
  })

  it("exposes decide as a pure function without requiring Effect or inference", () => {
    const decision = decide("screening")
    assert.equal(typeof decision.action, "string")
    assert.equal(Effect.isEffect(decision), false)
  })
})
