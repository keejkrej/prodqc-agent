# Checks library changelog

Only **accepted** diffs belong here after an owner signs off. This library is currently `status: proposed`.

## 0.3.0 — proposed — 2026-10-22

- Status set to `proposed` (no owner has accepted anything yet).
- Renamed `inverted-ee-formula` → `ee-formula-error` with distinct messages for `total/free` (inverted) and `free/total` without `1 −` (leak fraction, mislabelled).
- Added `in-well-conc-out-of-range` (configurable ranges in `ribogreen-ee.ranges.json`; default high-range `1:200` linear up to ~1 ug/mL in-well).
- Split incubation into lysis vs dye; added Triton final %, sample dilution, blank subtraction.
- `methods-vs-wiki` matches linked dataset dates first; submission date is fallback only.
- Optional `obi_id` on AssayType and `chebi_id` on reagent fields for JSON-LD (Triton X-100 `CHEBI:9750`; RiboGreen none).
- Approver: pending.

## 0.2.0 — 2026-10-21

- Added `methods-vs-wiki`: flag when a paper’s extracted variant fields disagree with the protocol version current before submission.
- Approver: library seed (synthetic paper vs wiki fixtures, not a lab run).

## 0.1.0 — 2026-10-21

- Added `ribogreen-ee` with generic classes: `missing-dual-standard-curves`, `inverted-ee-formula`, `dye-dilution-mismatch`, `well-volume-mismatch`.
- Approver: library seed (synthetic worked example, not a lab run).
