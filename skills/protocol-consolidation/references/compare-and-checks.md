# Step 3 — Compare versions and apply the assay checklist

## Shared checks library

Load `checks/<assay-type>.md`. That file is the **versioned, generic** checklist for the assay class. It is the self-improvement artifact labs may share. Do not copy lab-specific concentrations, page titles, or owner names into it.

If no file exists for the assay type, copy `checks/_template.md` into a proposed diff (`runs/<run-id>/proposed-checks/add-<assay-type>.diff`). Do not add the file until a human accepts the diff.

## Side-by-side

For each shortlisted version, extract only what the checklist asks (curves present or not, formula shape, dilution statements, volumes, incubation, wavelengths). Prefer the local variant-table CLI so the same fields can be exported without protocol text. Put hits in `runs/<run-id>/checklist-hits.md`:

```
## check-id
- version: <id>  result: hit | clear | unknown
  evidence: source pointer (file/page, version, excerpt)
```

`unknown` means the source did not say. That is an open question, not a pass.

## Scientific error classes (examples)

These are **generic**. The RiboGreen worked example uses them; other assays will grow their own list via approved diffs.

| Class | What to flag |
| --- | --- |
| Missing calibration / standard curves | Assay that needs both a total (lysed) and a free (unlysed) curve, but only one (or none) is described |
| Formula error (`ee-formula-error`) | `total/free` inverts free and total; `free/total` without `1 −` is the leak fraction mislabelled as EE. Distinct messages. |
| Dilution mismatch | Dye or sample dilution differs across versions (for example 1:100 vs 1:200) with no recorded reason |
| Volume inconsistency | Standard-curve well volume ≠ sample well volume, or versions disagree on well volume |

Do not “correct” a number in the draft to the value you prefer. Record the conflict and leave it for the owner.

## Drafting CLI comparison

After step 4 has produced sourced drafts, the CLI `comparison.md` is the colleague-facing side-by-side (steps, params, open questions). Checklist hits are the **scientific** overlay on that comparison, not a replacement for it.
