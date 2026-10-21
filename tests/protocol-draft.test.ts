import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { Effect } from "effect"
import {
  assembleSourcedDraft,
  decodeSourcedDraftProtocolSync,
  extractDraftFields,
  extractPdfText,
  GroundedProtocolDraftInferenceLive,
  isGroundedPointer,
  listProtocolSourceFiles,
  loadProtocolSources,
  ProtocolSourceCountError,
  runProtocolDrafting,
  toUcum,
  writeSimplePdf
} from "../src/index.ts"

const FIXTURE_DIR = path.join(process.cwd(), "fixtures/protocol-draft/versions")
const MODEL = "synthetic-fixture-v0"

const runFixtures = (inputDir: string, outputDir: string) =>
  runProtocolDrafting(inputDir, outputDir, MODEL).pipe(
    Effect.provide(GroundedProtocolDraftInferenceLive)
  )

describe("lab-pilot protocol drafting CLI (SYNTHETIC fixtures only)", () => {
  it("loads 2–5 SYNTHETIC versions and drafts a sourced protocol per version", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "protocol-draft-"))
    const result = await Effect.runPromise(runFixtures(FIXTURE_DIR, outputDir))
    assert.equal(result.drafts.length, 3)
    for (const draft of result.drafts) {
      assert.equal(draft.draft, true)
      assert.equal(draft.schema_version, "0.1.0-draft")
      assert.equal(draft.status, "draft")
      assert.equal(draft.synthetic, true)
      assert.equal(draft.model, MODEL)
      assert.match(draft.disclaimer, /not a registered ProtocolVersion/i)
      const roundTrip = decodeSourcedDraftProtocolSync(JSON.parse(JSON.stringify(draft)))
      assert.equal(roundTrip.protocol_id, draft.protocol_id)
    }
    const v1 = result.drafts.find((draft) => draft.semver === "1.0.0")
    const v2 = result.drafts.find((draft) => draft.semver === "1.1.0")
    const v3 = result.drafts.find((draft) => draft.semver === "1.2.0")
    assert.ok(v1)
    assert.ok(v2)
    assert.ok(v3)
    assert.equal(v1.formulation.n_p_ratio?.value, 5)
    assert.equal(v1.formulation.n_p_ratio?.ucum, "{N/P}")
    assert.equal(v1.formulation.total_flow_rate?.value, 10)
    assert.equal(v1.formulation.total_flow_rate?.ucum, "mL/min")
    assert.equal(v2.formulation.n_p_ratio?.value, 6)
    assert.equal(v2.formulation.total_flow_rate?.value, 12)
    assert.equal(v2.formulation.total_flow_rate?.ucum, "mL/min")
  })

  it("keeps a source line pointer on every drafted field and never invents unread values", async () => {
    const sources = await loadProtocolSources(FIXTURE_DIR)
    const v1 = sources.find((doc) => doc.basename.includes("v1"))
    assert.ok(v1)
    const extracted = extractDraftFields(v1)
    const draft = assembleSourcedDraft({ model: MODEL, document: v1, extracted })
    assert.ok(draft.formulation.n_p_ratio)
    assert.equal(
      isGroundedPointer(draft.formulation.n_p_ratio.source, draft.formulation.n_p_ratio.value, v1.lines),
      true
    )
    for (const material of draft.materials) {
      assert.equal(isGroundedPointer(material.name.source, material.name.value, v1.lines), true)
    }
    for (const step of draft.process_steps) {
      assert.equal(isGroundedPointer(step.title.source, step.title.value, v1.lines), true)
      if (step.observation_gate) {
        assert.equal(
          isGroundedPointer(
            step.observation_gate.source,
            step.observation_gate.observation,
            v1.lines
          ),
          true
        )
      }
    }
    for (const spec of draft.release_specs) {
      const value = spec.value ?? spec.min
      assert.ok(value)
      assert.equal(isGroundedPointer(value.source, value.value, v1.lines), true)
    }
    assert.equal(draft.invented_values_rejected, 0)
  })

  it("drops a hallucinated field that is not on the cited source line", async () => {
    const sources = await loadProtocolSources(FIXTURE_DIR)
    const v1 = sources.find((doc) => doc.basename.includes("v1"))
    assert.ok(v1)
    const extracted = extractDraftFields(v1)
    const first = extracted.process_steps[0]
    assert.ok(first)
    const poisoned = {
      ...extracted,
      process_steps: [
        {
          ...first,
          params: [
            ...first.params,
            {
              name: "invented_pressure",
              value: 999,
              ucum: "kPa",
              source: {
                file: v1.basename,
                line: 1,
                excerpt: "SYNTHETIC"
              }
            }
          ]
        },
        ...extracted.process_steps.slice(1)
      ]
    }
    const drafted = assembleSourcedDraft({
      model: MODEL,
      document: v1,
      extracted: poisoned
    })
    assert.ok(drafted.invented_values_rejected >= 1)
    const mix = drafted.process_steps.find((step) => step.key.includes("mix"))
    assert.ok(mix)
    assert.equal(
      mix.params.some((param) => param.name === "invented_pressure"),
      false
    )
    assert.ok(drafted.open_questions.some((question) => question.kind === "ungrounded_value"))
  })

  it("keeps until-clear observation gates and cloudy remake branches instead of one path", async () => {
    const sources = await loadProtocolSources(FIXTURE_DIR)
    const v1 = sources.find((doc) => doc.basename.includes("v1"))
    const v2 = sources.find((doc) => doc.basename.includes("v2"))
    assert.ok(v1)
    assert.ok(v2)
    const d1 = assembleSourcedDraft({
      model: MODEL,
      document: v1,
      extracted: extractDraftFields(v1)
    })
    const d2 = assembleSourcedDraft({
      model: MODEL,
      document: v2,
      extracted: extractDraftFields(v2)
    })
    const mix1 = d1.process_steps.find((step) => step.key.includes("mix"))
    const mix2 = d2.process_steps.find((step) => step.key.includes("mix"))
    assert.ok(mix1?.observation_gate)
    assert.equal(mix1.observation_gate.kind, "until_observation")
    assert.equal(mix1.observation_gate.observation, "clear")
    assert.ok(mix1.branches.length > 0)
    assert.match(mix1.branches[0]?.then.value ?? "", /remake/i)
    assert.ok(mix2?.observation_gate)
    assert.equal(mix2.observation_gate.observation, "clear")
    assert.match(mix2.branches[0]?.then.value ?? "", /remake/i)
    assert.equal(
      mix1.params.some((param) => param.name === "expected_duration_minutes"),
      false
    )
  })

  it("flags missing units, conflicting values, and vague endpoints as open questions", async () => {
    const sources = await loadProtocolSources(FIXTURE_DIR)
    const v1 = sources.find((doc) => doc.basename.includes("v1"))
    const v3 = sources.find((doc) => doc.basename.includes("v3"))
    assert.ok(v1)
    assert.ok(v3)
    const d1 = assembleSourcedDraft({
      model: MODEL,
      document: v1,
      extracted: extractDraftFields(v1)
    })
    const d3 = assembleSourcedDraft({
      model: MODEL,
      document: v3,
      extracted: extractDraftFields(v3)
    })
    assert.ok(d1.open_questions.some((question) => question.kind === "missing_unit"))
    const ee = d1.release_specs.find((spec) => spec.metric === "ee_pct")
    assert.equal(ee?.value?.value, 90)
    assert.equal(ee?.value?.ucum, null)
    assert.ok(d3.open_questions.some((question) => question.kind === "vague_endpoint"))
    assert.ok(d3.open_questions.some((question) => question.kind === "conflicting_values"))
    const mix3 = d3.process_steps.find((step) => step.key.includes("mix"))
    assert.equal(mix3?.observation_gate, undefined)
  })

  it("writes a markdown report with step diffs and one-page per-person comparison", async () => {
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "protocol-draft-report-"))
    const result = await Effect.runPromise(runFixtures(FIXTURE_DIR, outputDir))
    const report = await readFile(result.reportPath, "utf8")
    assert.match(report, /Step-by-step differences/)
    assert.match(report, /Open questions/)
    assert.match(report, /Formulating scientist/)
    assert.match(report, /QC scientist/)
    assert.match(report, /Reviewing colleague/)
    assert.match(report, /total_flow_rate/)
    assert.match(report, /10 mL\/min/)
    assert.match(report, /12 mL\/min/)
    assert.match(report, /until clear/)
    assert.match(report, /never commit real protocol/i)
    const written = JSON.parse(
      await readFile(
        result.draftPaths.find((file) => file.includes("v1")) ?? "",
        "utf8"
      )
    ) as { draft: boolean; formulation: { n_p_ratio: { source: { line: number } } } }
    assert.equal(written.draft, true)
    assert.ok(written.formulation.n_p_ratio.source.line >= 1)
  })

  it("extracts text from a SYNTHETIC PDF and maps lab units to UCUM", async () => {
    assert.equal(toUcum("mL/min"), "mL/min")
    assert.equal(toUcum("deg C"), "Cel")
    assert.equal(toUcum("percent"), "%")
    assert.equal(toUcum("furlong"), null)
    const lines = [
      "SYNTHETIC FIXTURE PDF",
      "Protocol family: lnp_microfluidic",
      "Version: 1.1.0",
      "N/P ratio: 6",
      "Total flow rate: 12 mL/min",
      "1. Microfluidic mix",
      "Continue until the suspension is clear."
    ]
    const pdf = writeSimplePdf(lines)
    const extracted = extractPdfText(pdf)
    assert.match(extracted, /Total flow rate: 12 mL\/min/)
    assert.match(extracted, /until the suspension is clear/)

    const tmp = await mkdtemp(path.join(os.tmpdir(), "protocol-draft-pdf-"))
    const v1 = await readFile(path.join(FIXTURE_DIR, "SYNTHETIC-v1-2024-03.md"))
    const v3 = await readFile(path.join(FIXTURE_DIR, "SYNTHETIC-v3-lab-notes.txt"))
    await writeFile(path.join(tmp, "SYNTHETIC-v1-2024-03.md"), v1)
    await writeFile(path.join(tmp, "SYNTHETIC-v2-2025-01.pdf"), pdf)
    await writeFile(path.join(tmp, "SYNTHETIC-v3-lab-notes.txt"), v3)
    const files = await listProtocolSourceFiles(tmp)
    assert.equal(files.some((file) => file.endsWith(".pdf")), true)
    const outputDir = await mkdtemp(path.join(os.tmpdir(), "protocol-draft-pdf-out-"))
    const result = await Effect.runPromise(runFixtures(tmp, outputDir))
    const fromPdf = result.drafts.find((draft) => draft.source_document.file.endsWith(".pdf"))
    assert.ok(fromPdf)
    assert.equal(fromPdf.formulation.total_flow_rate?.value, 12)
    assert.equal(
      fromPdf.process_steps.find((step) => step.key.includes("mix"))?.observation_gate?.observation,
      "clear"
    )
  })

  it("rejects a folder that is not 2–5 protocol versions", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "protocol-draft-one-"))
    await writeFile(path.join(tmp, "only.txt"), "SYNTHETIC\n")
    await assert.rejects(() => listProtocolSourceFiles(tmp), ProtocolSourceCountError)
  })
})
