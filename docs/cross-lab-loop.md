# Cross-lab loop

What moves between labs, and what never does. Protocols and raw data stay in the lab that produced them. The loop exists so a **new** lab can pick up generic checks and see whether its owners actually accept them.

Machine schemas: `skills/protocol-consolidation/schemas/*.schema.json`.

## Loop

```
Lab A (private wiki, private runs)
  → publish SharedCheck { assay, rule, reason }
  → publish CheckVerdict { accept | reject }   // weights the rule
  → publish OutcomeSummary per structured variant (counts only)
  → publish VariantTable { lab_id, assay, fields[name]={value, source:{file,line}} }
  → publish ProposedChange { assay, rule, reason }

Lab B (new)
  → owner reviews each SharedCheck
  → CheckVerdict accept | reject
  → adopts a ProposedChange only if Lab B's owner signs off
  → writes its own OutcomeSummary per variant
```

Headline metric: **new-lab check accept rate**

```
accepts_from_labs_whose_first_verdict_on_that_check_is_this_one
──────────────────────────────────────────────────────────────
those accepts + those rejects
```

Use `lab_novelty: "new"` on the verdict. Returning labs still weight rules (`accept` → `weight_delta +1`, `reject` → `−1`) but they do not count in the headline. If owners in the next lab reject a check, the rule is too local or too vague — fix the wording or retire it; do not ship protocol text to “explain” it.

## What may leave the lab

| Object | Payload | Role |
| --- | --- | --- |
| Shared check | `assay`, `rule`, `reason` (+ `id`, `library_version`) | The generic error class |
| Verdict | `accept` / `reject` on a `check_id` | Weights that rule |
| Outcome summary | counts keyed by **structured variant** (no notes) | How that method shape fared, without values |
| Variant field table | `lab_id`, `assay`, `fields[name]={value, source:{file,line}}` | Compare method shape; no protocol text |
| Proposed change | same shape as a check, `status: proposed` | Adopted only after the **receiving** lab’s owner signs off |

## What never leaves

- Protocol pages, drafts, `comparison.md`, attachments
- `protocol_page_id`, owner names, space keys, titles, excerpts
- Raw QC values, plate files, instrument exports
- Variant `notes` (the only free-text field on a variant)
- Lab ontology graphs (local; see [lab-ontology.md](lab-ontology.md))

## Provenance on every local QC and sign-off

Every QC result and every signed-off record **in the lab** must carry:

- `protocol_page_id` — Confluence content id
- `protocol_version` — version number from `get_history`
- `variant` — a **small fixed field set for that assay type**, not a blob of prose

Free text is allowed **only** on `variant.notes`. Strip `notes` (and page id) before any outcome summary is shared.

RiboGreen EE variant fields (machine schema: `schemas/variant-ribogreen-ee.schema.json`):

| Field | Type | Notes |
| --- | --- | --- |
| `assay_type` | `"ribogreen-ee"` | Discriminator |
| `dye_dilution` | string ratio (`1:100`) | Not a paragraph |
| `triton_standard_curve` | boolean | Lysed standard curve present? |
| `triton_final_conc_pct` | number | Final Triton X-100 % (UCUM `%`) |
| `curve_well_volume_uL` | number | Standard-curve well, microlitres |
| `sample_well_volume_uL` | number | Sample well, microlitres |
| `sample_dilution_ug_per_mL` | number | Target RNA µg/mL (UCUM `ug/mL`) |
| `lysis_time_min` | number | Lysis incubation minutes |
| `lysis_temperature_C` | number | Lysis temperature |
| `dye_incubation_time_min` | number | Dye incubation minutes |
| `dye_incubation_light` | `"dark"` \| `"light"` | Typical practice is dark |
| `blank_subtraction.triton_blank` | boolean | Triton blank subtracted? |
| `blank_subtraction.water_blank` | boolean | Water blank subtracted? |
| `ee_formula` | `1-(free/total)` \| `total/free` \| `free/total` | Normalised expression |
| `excitation_nm` | number | Nanometres |
| `emission_nm` | number | Nanometres |
| `notes` | string | Only free text; local only |
| `reagents.*.chebi_id` | string \| null | Optional. Triton X-100 `CHEBI:9750`; RiboGreen `null` (no term) |

Cross-lab field tables flatten the two blanks. Other assay types get their own fixed set in `schemas/variant-<assay>.schema.json`. Do not add ad-hoc keys.

## Shared check

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SharedCheck",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "assay", "rule", "reason", "library_version"],
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "assay": { "type": "string", "minLength": 1 },
    "rule": { "type": "string", "minLength": 1 },
    "reason": { "type": "string", "minLength": 1 },
    "library_version": { "type": "string", "pattern": "^[0-9]+\\.[0-9]+\\.[0-9]+$" }
  }
}
```

Example:

```json
{
  "id": "ee-formula-error",
  "assay": "ribogreen-ee",
  "rule": "Flag total/free (inverted) and free/total without 1 − (leak fraction, mislabelled) with distinct messages.",
  "reason": "Those two expressions are different errors: one inverts free and total; the other reports leak as EE.",
  "library_version": "0.3.0"
}
```

## Verdict (weights the rule)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CheckVerdict",
  "type": "object",
  "additionalProperties": false,
  "required": ["check_id", "assay", "verdict", "lab_novelty", "at"],
  "properties": {
    "check_id": { "type": "string", "minLength": 1 },
    "assay": { "type": "string", "minLength": 1 },
    "verdict": { "type": "string", "enum": ["accept", "reject"] },
    "lab_novelty": { "type": "string", "enum": ["new", "returning"] },
    "weight_delta": { "type": "integer", "enum": [-1, 1] },
    "at": { "type": "string", "format": "date-time" }
  }
}
```

Example (new lab, counts toward the headline metric):

```json
{
  "check_id": "ee-formula-error",
  "assay": "ribogreen-ee",
  "verdict": "accept",
  "lab_novelty": "new",
  "weight_delta": 1,
  "at": "2026-10-21T12:00:00.000Z"
}
```

Rule weight for check *c* is the sum of `weight_delta` (default `+1` / `−1`). Do not attach owner names.

## Outcome summary (per variant)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "OutcomeSummary",
  "type": "object",
  "additionalProperties": false,
  "required": ["assay", "variant", "n_qc_results", "n_signed_off"],
  "properties": {
    "assay": { "type": "string" },
    "variant": { "$ref": "variant-key-ribogreen-ee.schema.json" },
    "n_qc_results": { "type": "integer", "minimum": 0 },
    "n_signed_off": { "type": "integer", "minimum": 0 },
    "n_spec_miss": { "type": "integer", "minimum": 0 },
    "n_accepted_signoff": { "type": "integer", "minimum": 0 },
    "n_overridden_signoff": { "type": "integer", "minimum": 0 }
  }
}
```

Example (synthetic counts, no measurements):

```json
{
  "assay": "ribogreen-ee",
  "variant": {
    "assay_type": "ribogreen-ee",
    "dye_dilution": "1:200",
    "triton_standard_curve": true,
    "triton_final_conc_pct": 0.5,
    "curve_well_volume_uL": 100,
    "sample_well_volume_uL": 100,
    "sample_dilution_ug_per_mL": 0.5,
    "lysis_time_min": 10,
    "lysis_temperature_C": 37,
    "dye_incubation_time_min": 5,
    "dye_incubation_light": "dark",
    "blank_subtraction": { "triton_blank": true, "water_blank": true },
    "ee_formula": "1-(free/total)",
    "excitation_nm": 485,
    "emission_nm": 530
  },
  "n_qc_results": 8,
  "n_signed_off": 8,
  "n_spec_miss": 2,
  "n_accepted_signoff": 7,
  "n_overridden_signoff": 1
}
```

## Proposed changes

Same `{ assay, rule, reason }` core as a check, plus `kind` and `status`. A lab that receives a proposal **does not auto-merge**. Its assay owner must sign off (`status` → `adopted`) or reject. Until then the local `checks/` file is unchanged.

See `skills/protocol-consolidation/schemas/proposed-change.schema.json`.

Compare mode (field tables, mismatch report): `skills/protocol-consolidation/references/compare-mode.md`. Lab ontology (local graph, methods vs wiki): [lab-ontology.md](lab-ontology.md).
