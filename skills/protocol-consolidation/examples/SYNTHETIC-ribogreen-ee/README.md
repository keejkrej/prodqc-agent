# SYNTHETIC worked example — RiboGreen EE

**ALL TEXT HERE IS FICTIONAL.** It is not a lab SOP, not measured data, and not copied from any wiki. Use it to see the six-step flow and the four generic error classes.

Assay type: `ribogreen-ee` (see `checks/ribogreen-ee.md`).

## 1. Wiki map (synthetic)

`wiki-map.json` is a toy graph: three EE pages plus one empty stub and a bulk-import cluster. In a real run this file is produced by `build_space_graph` + `get_history` + `get_page_links` (read-only).

Signals in the toy map:

| Signal | Synthetic observation |
| --- | --- |
| Version counts | EE page A has 3 versions; import pack pages have 1 |
| Staleness | Owner threshold 24 months → page C last touched 2022 is stale |
| Empty | “EE template (do not use)” has no method body |
| Bulk import | Eight “Imported SOP pack” pages, same timestamp, same author, no links |

## 2. Grouping

Owner names the family “RiboGreen encapsulation efficiency”. Shortlist **three** versions (files in `versions/`):

| Version | Role |
| --- | --- |
| v1 | Older page: only a lysed curve; inverted formula; dye 1:100; 200 µL wells |
| v2 | Current page: both curves; still inverted formula; dye 1:200; 100 µL wells |
| v3 | Lab notes: states `1 − free/total`; volumes mixed in one paragraph |

Empty stub and import pack are out of the shortlist.

## 3. Checklist hits (generic classes)

| Check | v1 | v2 | v3 |
| --- | --- | --- | --- |
| `missing-dual-standard-curves` | hit (Triton curve only) | clear | unknown |
| `inverted-ee-formula` | hit (`total/free`) | hit (`total/free`) | clear (`1 − free/total`) |
| `dye-dilution-mismatch` | 1:100 | 1:200 | unknown → mismatch across v1/v2 |
| `well-volume-mismatch` | 200 µL stated once | 100 µL stated once | hit (curve 200 µL, samples 100 µL) |

## 4. Draft

Copy `versions/` to a private `input/` and run the drafting CLI. Every number in a `*.draft.json` must appear on the cited line. The inverted formula is **not** rewritten by the CLI; it is sourced as written, then flagged.

## 5. Open decisions (`open-decisions.md`)

- Dual curves required?
- EE formula `1 − (free/total)` vs `total/free`?
- Dye dilution 1:100 vs 1:200 — which, and was the change documented?
- One well volume for curve and samples?

## 6. Human review → proposed check

Suppose the owner accepts `1 − (free/total)` and asks that **undocumented dye-dilution changes** stay a library check (already `dye-dilution-mismatch`). They also ask to catch “formula written as total/free” more explicitly in CHANGELOG language.

`proposed-check.diff` is a **sample approved-style diff** adding a one-line clarification to `inverted-ee-formula`. In a real run the agent only writes this file; a receiving lab applies it only when **its** owner signs off.

## Provenance on QC / sign-off

`qc-result.json` and `signed-off.json` show the required local envelope: `protocol_page_id`, `protocol_version`, and a RiboGreen `variant` (`dye_dilution`, `triton_standard_curve`, well volumes, incubation, normalised `ee_formula`, wavelengths, `notes`). Notes stay in the lab.

Shareable objects for the cross-lab loop (no protocol text):

- `shared-check.json` — `{ assay, rule, reason }`
- `verdict.json` — new-lab `accept` (weights the rule; counts toward the headline metric)
- `outcome-summary.json` — counts for the structured variant key (no `notes`, no values)
- variant field tables — extract/compare two fictional labs under [../../variant-table/fixtures/](../../variant-table/fixtures/)

Local graph (not shared): `lab-ontology.json`. `pr2-qc-mapping.json` shows a PR 2-shaped `QCMeasurement` + `Run` becoming `Dataset ran_under ProtocolVersion` (wiki page `N101` v2). Methods vs wiki uses the same field tables; see [docs/lab-ontology.md](../../../../docs/lab-ontology.md).

See [docs/cross-lab-loop.md](../../../../docs/cross-lab-loop.md).

Anonymised run roll-up: `anonymised-counts.json`.
