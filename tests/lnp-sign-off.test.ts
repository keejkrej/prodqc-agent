import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Effect } from "effect"
import {
  DEFAULT_SIMULATED_SIGNER_NAME,
  EventLogService,
  loadLnpDraftProtocol,
  makeHumanSignOff,
  makeLnpDemoLayer,
  resolveSignerName,
  runOneSimulatedLnpBatch,
  SignOffRequiresReasonError,
  SIMULATED_OVERRIDE_REASON
} from "../src/index.ts"

describe("LNP QC human sign-off (agent recommends, person signs)", () => {
  it("accepts a recommendation without changing the final action", () => {
    const record = makeHumanSignOff({
      recommendedAction: "use_with_note",
      intent: { outcome: "accepted" },
      signerName: DEFAULT_SIMULATED_SIGNER_NAME,
      signedAt: "2026-11-04T10:20:00Z" as Parameters<typeof makeHumanSignOff>[0]["signedAt"]
    })
    assert.equal(record.outcome, "accepted")
    assert.equal(record.finalAction, "use_with_note")
    assert.equal(record.reason, null)
    assert.equal(record.signerName, DEFAULT_SIMULATED_SIGNER_NAME)
    assert.equal(record.simulated, true)
  })

  it("records an override only when a reason and final action are supplied", () => {
    const record = makeHumanSignOff({
      recommendedAction: "remake",
      intent: {
        outcome: "overridden",
        finalAction: "use_with_note",
        reason: SIMULATED_OVERRIDE_REASON
      },
      signerName: DEFAULT_SIMULATED_SIGNER_NAME,
      signedAt: "2026-11-04T10:20:00Z" as Parameters<typeof makeHumanSignOff>[0]["signedAt"]
    })
    assert.equal(record.outcome, "overridden")
    assert.equal(record.recommendedAction, "remake")
    assert.equal(record.finalAction, "use_with_note")
    assert.equal(record.reason, SIMULATED_OVERRIDE_REASON)
  })

  it("rejects an override that has no reason", () => {
    assert.throws(
      () =>
        makeHumanSignOff({
          recommendedAction: "remake",
          intent: {
            outcome: "overridden",
            finalAction: "use_with_note",
            reason: "   "
          },
          signerName: DEFAULT_SIMULATED_SIGNER_NAME,
          signedAt: "2026-11-04T10:20:00Z" as Parameters<typeof makeHumanSignOff>[0]["signedAt"]
        }),
      SignOffRequiresReasonError
    )
  })

  it("reads the signer from --signer, then LNP_SIGNER_NAME, then the simulated default", () => {
    assert.equal(resolveSignerName([], {}), DEFAULT_SIMULATED_SIGNER_NAME)
    assert.equal(
      resolveSignerName([], { LNP_SIGNER_NAME: "SIMULATED Operator Kim" }),
      "SIMULATED Operator Kim"
    )
    assert.equal(
      resolveSignerName(["--signer", "SIMULATED Dr. Lee"], {
        LNP_SIGNER_NAME: "SIMULATED Operator Kim"
      }),
      "SIMULATED Dr. Lee"
    )
    assert.equal(
      resolveSignerName(["--signer=SIMULATED Dr. Lee"], {}),
      "SIMULATED Dr. Lee"
    )
  })

  it("appends an override sign-off next to the recommendation on the same hash chain", async () => {
    const protocol = await Effect.runPromise(loadLnpDraftProtocol())
    const program = Effect.gen(function* () {
      const result = yield* runOneSimulatedLnpBatch(protocol, "in_vivo", {
        signerName: DEFAULT_SIMULATED_SIGNER_NAME,
        signOff: {
          outcome: "overridden",
          finalAction: "use_with_note",
          reason: SIMULATED_OVERRIDE_REASON
        }
      })
      const log = yield* EventLogService
      const report = yield* log.verifyRequestChain(result.context.request.id)
      return { result, report }
    }).pipe(Effect.provide(makeLnpDemoLayer(protocol)))

    const { result, report } = await Effect.runPromise(program)
    assert.equal(result.decision.action, "remake")
    assert.equal(result.signOff.outcome, "overridden")
    assert.equal(result.signOff.finalAction, "use_with_note")
    assert.equal(result.signOff.reason, SIMULATED_OVERRIDE_REASON)

    const decidedIndex = result.auditLog.findIndex((entry) => entry.payload._tag === "qc.decided")
    const signed = result.auditLog[decidedIndex + 1]
    assert.ok(decidedIndex >= 0)
    assert.ok(signed)
    assert.equal(signed.payload._tag, "qc.signed_off")
    assert.equal(signed.actor_type, "human")
    assert.equal(signed.actor_id, DEFAULT_SIMULATED_SIGNER_NAME)
    assert.equal(signed.prev_hash, result.auditLog[decidedIndex]?.hash)
    if (signed.payload._tag === "qc.signed_off") {
      assert.equal(signed.payload.outcome, "overridden")
      assert.equal(signed.payload.recommended_action, "remake")
      assert.equal(signed.payload.final_action, "use_with_note")
      assert.equal(signed.payload.reason, SIMULATED_OVERRIDE_REASON)
    }
    assert.equal(report.chain_head, result.chainHead)
  })
})
