import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Effect } from "effect"
import {
  EventLogService,
  loadLnpDraftProtocol,
  runDemoBatches,
  runOneSimulatedLnpBatch,
  makeLnpDemoLayer
} from "../src/index.ts"

describe("SIMULATED LNP batch end-to-end", () => {
  it("runs one microfluidic batch for screening and in vivo with different QC actions", async () => {
    const protocol = await Effect.runPromise(loadLnpDraftProtocol())
    const { screening, inVivo } = await Effect.runPromise(runDemoBatches(protocol))

    assert.equal(screening.disclaimer, "ALL VALUES SIMULATED")
    assert.equal(inVivo.disclaimer, "ALL VALUES SIMULATED")
    assert.equal(screening.context.workOrder.downstreamStudyType, "screening")
    assert.equal(inVivo.context.workOrder.downstreamStudyType, "in_vivo")
    assert.equal(screening.decision.action, "use_with_note")
    assert.equal(inVivo.decision.action, "remake")

    const pdi = screening.measurements.find((row) => row.metric === "pdi")
    const ee = screening.measurements.find((row) => row.metric === "ee_pct")
    const zAvg = screening.measurements.filter((row) => row.metric === "z_avg_nm")
    const drift = screening.measurements.find((row) => row.metric === "size_drift_nm")
    assert.equal(pdi?.value, 0.21)
    assert.equal(pdi?.verdict, "fail")
    assert.equal(ee?.value, 87)
    assert.equal(ee?.verdict, "fail")
    assert.equal(zAvg[0]?.value, 94)
    assert.equal(zAvg[0]?.verdict, "pass")
    assert.equal(zAvg[1]?.value, 101)
    assert.equal(zAvg[1]?.verdict, "pass")
    assert.equal(drift?.assay, "dls_size_drift")
    assert.equal(drift?.value, 7)
    assert.equal(drift?.verdict, "fail")
    assert.equal(drift?.spec_max, 5)
    assert.equal(screening.measurements.length, 5)

    for (const result of [screening, inVivo]) {
      const decided = result.auditLog.find((entry) => entry.payload._tag === "qc.decided")
      assert.ok(decided)
      if (decided?.payload._tag !== "qc.decided") {
        throw new Error("expected qc.decided")
      }
      assert.equal(decided.payload.simulated, true)
      assert.equal(decided.payload.borderline_batch, true)
      assert.equal(decided.payload.specs_evaluated, 4)
      assert.equal(decided.payload.specs_missed, 3)
      assert.equal(decided.payload.all_misses_within_borderline_band, true)
      assert.equal(
        decided.payload.spec_miss_summary,
        "3 of 4 specs missed, all within the borderline band"
      )
      assert.equal(decided.payload.pdi, 0.21)
      assert.equal(decided.payload.ee_pct, 87)
      assert.equal(decided.payload.size_drift_nm, 7)
      assert.equal(decided.payload.rule_id, "lnp_qc_disposition_v0_draft")
      assert.equal(decided.payload.downstream_study_type, result.decision.downstreamStudyType)
      assert.equal(decided.payload.action, result.decision.action)
      assert.equal(decided.payload.agent_id, result.decision.actor.agentId)
      assert.equal(decided.payload.operator_id, result.decision.actor.operatorId)
      assert.match(decided.actor_id, /lnp_formulation/)
      assert.ok(decided.hash.startsWith("sha256:"))
      assert.equal(result.instrumentEvents.length, 4)
      assert.equal(
        result.instrumentEvents.every((event) => event.payload["simulated"] === true),
        true
      )
      const measured = result.auditLog.filter((entry) => entry.payload._tag === "qc.measured")
      assert.equal(measured.length, 5)
      const driftMeasured = measured.find(
        (entry) =>
          entry.payload._tag === "qc.measured" &&
          entry.entity_id === result.context.ids.sizeDriftMeasurementId
      )
      assert.ok(driftMeasured)
      if (driftMeasured?.payload._tag === "qc.measured") {
        assert.equal(driftMeasured.payload.verdict, "fail")
      }
    }
  })

  it("verifies the append-only hash chain for a SIMULATED run", async () => {
    const protocol = await Effect.runPromise(loadLnpDraftProtocol())
    const program = Effect.gen(function* () {
      const result = yield* runOneSimulatedLnpBatch(protocol, "screening")
      const log = yield* EventLogService
      const report = yield* log.verifyRequestChain(result.context.request.id)
      return { result, report }
    }).pipe(Effect.provide(makeLnpDemoLayer(protocol)))

    const { result, report } = await Effect.runPromise(program)
    assert.equal(report.verified_event_count, result.auditLog.length)
    assert.equal(report.chain_head, result.chainHead)
    assert.ok(report.verified_event_count >= 8)
    const codes = result.auditLog.map((entry) => entry.payload._tag)
    assert.ok(codes.includes("step.started"))
    assert.ok(codes.includes("step.completed"))
    assert.ok(codes.includes("qc.measured"))
    assert.ok(codes.includes("qc.decided"))
    assert.ok(codes.includes("run.completed"))
  })
})
