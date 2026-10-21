# prodqc-agent

Effect-TS domain, multi-agent, transparency, insurance, and self-improvement abstractions for multi-modality bio-production and QC (protein, LNP, and later modalities).

This repository is currently an agent core: typed contracts, schema models, and a small runnable simulation. There is no UI.

## Simulated LNP formulation demo (November pitch)

**ALL VALUES ARE SIMULATED.** No live instruments, no patient material, no vendor SDK.

The agent core runs **one** microfluidic LNP mixing batch from mix through QC. The QC policy **only recommends**. A named person then signs an append-only record on the same hash chain: `accepted` or `overridden` (an override requires a reason and states the final action). The same simulated measurements are evaluated twice: a **screening** work order (recommendation accepted) and an **in vivo** work order (recommendation accepted). The CLI also prints a compact **override example** with a reason.

```bash
npm run demo:lnp
# equivalent: pnpm demo:lnp
npm run demo:lnp -- --signer "SIMULATED Dr. Ada Ng"
LNP_SIGNER_NAME="SIMULATED Dr. Ada Ng" npm run demo:lnp
```

Default signer if neither `--signer` nor `LNP_SIGNER_NAME` is set: **SIMULATED Dr. Ada Ng**.

What the demo uses:

- Draft protocol file `protocols/lnp-microfluidic-mixing.draft.json` (first-pass structure, `draft: true`), loaded and validated with Effect Schema. It declares materials/lots, formulation, process steps, QC assays, specs (PDI ≤ 0.20, EE ≥ 90%, 24 h size drift), and per-downstream-use decision rules.
- Vendor-neutral Effect instrument services (`MicrofluidicMixerService`, `DlsInstrumentService`, `RibogreenPlateReaderService`) with **simulation Layers**. A later Malvern / plate-reader / mixer adapter can replace those Layers without changing the agent.
- A deterministic rule-based QC policy (no LLM). An `InferenceProvider` exists as an optional plug-in and is not required for this path.
- Append-only `EventLogService` entries: `qc.decided` is the **agent recommendation** (action, rule and thresholds, downstream use, PDI / EE% / size-drift evidence, computed spec-miss summary, `borderline_batch`, timestamps, agent identity). Immediately after it, `qc.signed_off` is the **human sign-off** (signer name, timestamp, `accepted` or `overridden`; override includes a reason and the final action). Both sit on the same hash chain. The agent does not release product.
- A **derived** 24 h DLS size-drift `QCMeasurement` (`dls_size_drift` / `size_drift_nm`) with its own verdict. Each absolute DLS Z-average is judged only against the size range; drift is a separate logged result, not implied by the t24 h size pass/fail.

Simulated pitch numbers (also in the protocol `simulation` block): DLS t0 Z-average **94 nm**, PDI **0.21** (lab limit 0.20); RiboGreen EE **87%** (spec ≥ 90%); DLS t+24 h Z-average **101 nm**. The demo summary is computed from those results (this fixture: **3 of 4 specs missed, all within the borderline band** — PDI, EE%, and 24 h size drift; Z-average range holds). Screening recommendation `use_with_note` is **accepted**; in vivo recommendation `remake` is **accepted**. The CLI then shows an example override of that in vivo `remake` to `use_with_note` with a simulated reason.

```bash
npm test
npm run typecheck
```

## Lab-pilot protocol drafting CLI

This is **not** the full migration pipeline. It drafts 2–5 local versions of one protocol into the existing `protocols/*.draft.json` schema (`draft: true`, Effect Schema) so a colleague can review differences.

```bash
# SYNTHETIC fixtures only (committed). Writes gitignored output/.
npm run draft:protocol:fixtures

# Counts only — safe for a pitch slide (no protocol text, values, or names).
npm run draft:protocol:fixtures -- --summary-only
npm run draft:protocol:fixtures -- --summary-only --review fixtures/protocol-draft/SYNTHETIC-colleague-review.json

# Real lab protocols: copy 2–5 versions (txt/md/pdf) into input/ — never commit them.
mkdir -p input output
PROTOCOL_DRAFT_MODEL="<model-key>" npm run draft:protocol -- --input input --output output --summary-only
```

`PROTOCOL_DRAFT_MODEL` is required and is passed to `InferenceProvider`. Optional `PROTOCOL_DRAFT_INFER_URL` swaps in an HTTP infer Layer; otherwise the CLI uses a source-grounded extractor Layer. After infer, every field is checked against the source line: unread values are dropped, not filled in.

The drafter:

- Keeps observation-gated steps such as **until clear**, and `if cloudy → remake` branches, instead of forcing one linear path.
- Stores units as UCUM (`mL/min`, `nm`, `%`, `Cel`, `h`, `1`, `{N/P}`).
- Writes one sourced `*.draft.json` per version plus `comparison.md`: step-by-step diffs, open questions (missing units, conflicting values, vague endpoints), and a one-page comparison for the formulating scientist, QC, and a reviewing colleague.
- `--summary-only` prints counts only (versions, steps per version, differences by category, open questions by category, and review corrections if `--review` is supplied). That output is what is safe to put on a pitch slide.
- Treats `input/` and `output/` as private. Only SYNTHETIC fixtures under `fixtures/protocol-draft/` are committed.

How to collect 2–5 versions of one family from a self-hosted wiki and a laptop NAS (read-only, lab machine, no collector in this repo): [docs/collection-method.md](docs/collection-method.md).

