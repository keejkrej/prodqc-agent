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
