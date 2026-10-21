---
assay_type: ribogreen-ee
library_version: 0.1.0
status: accepted
---

# Checks: RiboGreen encapsulation efficiency (generic)

Applies to fluorescence-based nucleic-acid encapsulation efficiency (EE) assays that use a membrane-impermeant dye with a lysed (“total”) and unlysed (“free”) reading. Not a lab SOP.

## How to apply

For each shortlisted version: `hit`, `clear`, or `unknown`. Quote an excerpt in the private run folder only.

## Checks

### missing-dual-standard-curves

- **Class:** missing calibration / standard curves
- **Flag when:** the method describes at most one standard curve, or only a “total” (detergent-lysed) curve, or only a “free” (no-detergent) curve.
- **Clear when:** both a lysed (e.g. Triton) standard curve and a no-lysis standard curve are described.
- **Do not encode:** dye lot, vendor, or a lab’s curve concentrations.

### inverted-ee-formula

- **Class:** formula inversion
- **Flag when:** EE is written as `total/free`, `free/total` without `1 −`, or “total over free”.
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
