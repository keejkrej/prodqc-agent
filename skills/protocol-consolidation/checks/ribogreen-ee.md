---
assay_type: ribogreen-ee
library_version: 0.3.0
status: proposed
---

# Checks: RiboGreen encapsulation efficiency (generic)

Applies to fluorescence-based nucleic-acid encapsulation efficiency (EE) assays that use a membrane-impermeant dye with a lysed (“total”) and unlysed (“free”) reading. Not a lab SOP. **Status: proposed** — no assay owner has accepted this library yet.

## How to apply

For each shortlisted version: `hit`, `clear`, or `unknown`. Quote an excerpt in the private run folder only.

QC results and sign-offs for this assay must use the fixed variant `{ dye_dilution, triton_standard_curve, triton_final_conc_pct, curve_well_volume_uL, sample_well_volume_uL, sample_dilution_ug_per_mL, lysis_time_min, lysis_temperature_C, dye_incubation_time_min, dye_incubation_light, blank_subtraction.{triton_blank, water_blank}, ee_formula, excitation_nm, emission_nm, notes }`. Free text only in `notes`. Cross-lab export is the field table (values + `{file,line}`), never the page body.

## Checks

### missing-dual-standard-curves

- **Class:** missing calibration / standard curves
- **Flag when:** the method describes at most one standard curve, or only a “total” (detergent-lysed) curve, or only a “free” (no-detergent) curve.
- **Clear when:** both a lysed (e.g. Triton) standard curve and a no-lysis standard curve are described.
- **Do not encode:** dye lot, vendor, or a lab’s curve concentrations.

### ee-formula-error

- **Class:** formula error (two distinct messages)
- **Flag when (inverted):** EE is written as `total/free` or “total over free”.
  - **Message:** EE written as total/free inverts free and total and does not report a fraction encapsulated.
- **Flag when (leak fraction, mislabelled):** EE is written as `free/total` without `1 −`.
  - **Message:** EE written as free/total without 1 − reports the leak fraction, mislabelled as encapsulation efficiency.
- **Clear when:** EE is `1 − (free/total)` (equivalently `(total − free) / total`) with free and total defined on the same standard-curve basis.
- **Do not encode:** a numeric EE spec (that belongs in the protocol draft, sourced).

### dye-dilution-mismatch

- **Class:** dilution mismatch
- **Flag when:** versions disagree on dye (or working-solution) dilution, such as 1:100 vs 1:200, and no version records why they differ.
- **Clear when:** all shortlisted versions state the same dilution, or a version states a dated change with a reason.
- **Do not encode:** which dilution is “correct” for a given lab until the owner says so — then propose a generic “undocumented mismatch” check, not the number itself, unless they mark the number as a shared class.

### well-volume-mismatch

- **Class:** volume inconsistency
- **Flag when:** standard-curve well volume and sample well volume differ inside one version, or versions disagree on well volume, with no reason recorded.
- **Clear when:** curve and sample wells use the same stated volume, or a stated reason for a difference.
- **Do not encode:** a canonical microlitre value for all labs.

### in-well-conc-out-of-range

- **Class:** in-well concentration vs dye linear range
- **Flag when:** the version’s in-well RNA concentration (stated `in_well_rna_ug_per_mL`, else `sample_dilution_ug_per_mL`) falls outside the linear range configured for **that version’s** dye dilution.
- **Default range:** high-range `1:200` is linear up to ~1 ug/mL in-well. Exact min/max live in `ribogreen-ee.ranges.json` (UCUM `ug/mL`) and are **configurable** — do not hard-code cutoffs here.
- **Clear when:** the in-well concentration is inside the configured range for that dilution.
- **Unknown when:** dilution, concentration, or a range for that dilution is missing.
- **Do not encode:** a single canonical concentration for all labs.

### methods-vs-wiki

- **Class:** methods vs current protocol
- **Flag when:** a paper’s methods section, extracted to the fixed variant fields, disagrees with the protocol version that was current on the dates of **linked datasets**. Use the publication’s submission date only when there are no linked datasets.
- **Clear when:** those extracted fields match that protocol version’s field table.
- **Do not encode:** titles, authors, or methods prose. Diff field tables only.
