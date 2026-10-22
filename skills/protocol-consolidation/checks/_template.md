---
assay_type: <kebab-case-assay-class>
library_version: 0.1.0
status: proposed
---

# Checks: `<assay_type>`

Generic scientific error classes for this assay type. No lab names, page titles, or site-specific numbers.

List the **fixed variant fields** for this assay (name, type). Free text only in `notes`. QC results and sign-offs must carry `protocol_page_id`, `protocol_version`, and that variant. Cross-lab export is that field table (values + `{file,line}`), never protocol text.

## How to apply

For each shortlisted version: `hit` (source shows the error class), `clear` (source shows the required control), or `unknown` (source does not say). Unknown → open decision, not a pass.

## Checks

### `<check-id>`

- **Class:** missing calibration | formula inversion | dilution mismatch | volume inconsistency | other (generic)
- **Flag when:** …
- **Clear when:** …
- **Do not encode:** site-specific concentrations or instrument serials
