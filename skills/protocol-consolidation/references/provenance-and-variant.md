# Provenance and structured variants

Every **QC result** and every **signed-off record** written in a lab must include:

1. `protocol_page_id` — Confluence content id of the protocol page
2. `protocol_version` — integer from `get_history`
3. `variant` — fixed fields for that assay type

Do not put method choices in prose. The only free-text field on a variant is `notes` (local; stripped before sharing).

Schemas:

- Local QC envelope: [../schemas/qc-result.schema.json](../schemas/qc-result.schema.json)
- Local sign-off envelope: [../schemas/signed-off-record.schema.json](../schemas/signed-off-record.schema.json)
- RiboGreen variant (with `notes`): [../schemas/variant-ribogreen-ee.schema.json](../schemas/variant-ribogreen-ee.schema.json)
- Shareable variant key (no `notes`): [../schemas/variant-key-ribogreen-ee.schema.json](../schemas/variant-key-ribogreen-ee.schema.json)
- Exportable field table (values + source pointer, no text): [../schemas/variant-table.schema.json](../schemas/variant-table.schema.json)

RiboGreen EE fields: `dye_dilution`, `triton_standard_curve` (bool), `curve_well_volume_uL`, `sample_well_volume_uL`, `incubation_time_min`, `incubation_temperature_C`, `ee_formula` (normalised: `1-(free/total)` / `total/free` / `free/total`), `excitation_nm`, `emission_nm`, `notes`.

If a source does not state a field, leave the QC/sign-off unwritten for that run or record an open decision — do not invent the dilution, the bool, the volumes, the incubation, the formula, or the wavelengths.

Cross-lab objects (check, verdict, outcome summary, field table): [docs/cross-lab-loop.md](../../../docs/cross-lab-loop.md). Compare mode: [compare-mode.md](compare-mode.md).
