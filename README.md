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
- Append-only `EventLogService` entries, including `qc.decided`: action, rule and thresholds, downstream use, PDI / EE% / size-drift evidence, `borderline_batch`, timestamps, operator and agent identity.

Simulated pitch numbers (also in the protocol `simulation` block): DLS t0 Z-average **94 nm**, PDI **0.21** (lab limit 0.20); RiboGreen EE **87%** (spec ≥ 90%); DLS t+24 h Z-average **101 nm**.

```bash
npm test
npm run typecheck
```
