# prodqc-agent

Effect-TS domain, multi-agent, transparency, insurance, and self-improvement abstractions for multi-modality bio-production and QC (protein, LNP, and later modalities).

This repository is currently an agent core: typed contracts, schema models, and a small runnable simulation. There is no UI.

## Simulated LNP formulation demo (November pitch)

**ALL VALUES ARE SIMULATED.** No live instruments, no patient material, no vendor SDK.

The agent core runs **one** microfluidic LNP mixing batch from mix through QC and writes a hash-chained audit record of the disposition. The same simulated measurements are evaluated twice: once for a **screening** work order and once for an **in vivo** work order, so the CLI shows two different actions from the same evidence.

```bash
npm run demo:lnp
# equivalent: pnpm demo:lnp
```

What the demo uses:

- Draft protocol file `protocols/lnp-microfluidic-mixing.draft.json` (first-pass structure, `draft: true`), loaded and validated with Effect Schema. It declares materials/lots, formulation, process steps, QC assays, specs (PDI ≤ 0.20, EE ≥ 90%, 24 h size drift), and per-downstream-use decision rules.
- Vendor-neutral Effect instrument services (`MicrofluidicMixerService`, `DlsInstrumentService`, `RibogreenPlateReaderService`) with **simulation Layers**. A later Malvern / plate-reader / mixer adapter can replace those Layers without changing the agent.
- A deterministic rule-based QC policy (no LLM). An `InferenceProvider` exists as an optional plug-in and is not required for this path.
- Append-only `EventLogService` entries, including `qc.decided`: action, rule and thresholds, downstream use, PDI / EE% / size-drift evidence, a computed spec-miss summary, `borderline_batch` for later traceability, timestamps, operator and agent identity.
- A **derived** 24 h DLS size-drift `QCMeasurement` (`dls_size_drift` / `size_drift_nm`) with its own verdict. Each absolute DLS Z-average is judged only against the size range; drift is a separate logged result, not implied by the t24 h size pass/fail.

Simulated pitch numbers (also in the protocol `simulation` block): DLS t0 Z-average **94 nm**, PDI **0.21** (lab limit 0.20); RiboGreen EE **87%** (spec ≥ 90%); DLS t+24 h Z-average **101 nm**. The demo summary is computed from those results (this fixture: **3 of 4 specs missed, all within the borderline band** — PDI, EE%, and 24 h size drift; Z-average range holds).

```bash
npm test
npm run typecheck
```
