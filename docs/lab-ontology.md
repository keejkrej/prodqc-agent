# Lab ontology

Local graph of how an assay, its wiki protocol versions, datasets, instruments, and publications hang together. Machine schema: `skills/protocol-consolidation/schemas/lab-ontology.schema.json`. Synthetic example: `skills/protocol-consolidation/examples/SYNTHETIC-ribogreen-ee/lab-ontology.json`.

This graph stays in the lab. Share the same objects the cross-lab loop already allows (generic checks, verdicts, variant field tables, anonymised counts) — not the graph, not page bodies, not names.

## Entities

| Entity | Required fields | Notes |
| --- | --- | --- |
| `AssayType` | `id` | e.g. `ribogreen-ee`. Optional `obi_id` (`OBI:0000070` for this assay). |
| `Reagent` | `id`, `label` | Optional `chebi_id` (`CHEBI:9750` for Triton X-100). Null/omit when no term exists (RiboGreen). Never invent. |
| `ProtocolVersion` | `page_id`, `version`, `valid_from`, `valid_to` | Wiki content id + `get_history` number. `valid_to` is exclusive; `null` means still current. |
| `Dataset` | `path`, `date`, `owner` | Plate export / raw file. `owner` is a Person id (role), not a name. |
| `Publication` | `doi`, `figures` | Figure ids listed on the paper. Optional `submitted` date. |
| `Instrument` | `id`, `kind` | e.g. `fluorescence_plate_reader` |
| `Person` | `id`, `role` | **Role only.** No display name, email, or initials. |

Figures are first-class (`id`, optional `label`) so they can sit on two edges at once.

Checks from `checks/<assay-type>.md` are in the graph so `applies_to` has a left-hand side.

## Edges

Every edge carries `provenance`:

| `kind` | When to use | Extra fields |
| --- | --- | --- |
| `stated` | Source says the link (run record names the protocol version; figure caption names the dataset) | — |
| `inferred` | Derived from dates or version history, not written down | `reason` |
| `confirmed` | A person with a role signed off | `who` (Person id), `when` (ISO datetime) |

| Edge | From → to | Typical provenance |
| --- | --- | --- |
| `ran_under` | Dataset → ProtocolVersion | `stated` on a QC/run record that already has `protocol_page_id` + `protocol_version` |
| `reported_in` | Figure → Publication | `stated` (the paper lists the figure) |
| `derived_from` | Figure → Dataset | `stated` if the caption cites the file; otherwise `inferred` from dates |
| `supersedes` | ProtocolVersion → ProtocolVersion | `inferred` from `get_history` (v3 supersedes v2) unless an owner confirms |
| `applies_to` | Check → AssayType | `stated` in the checks file; `confirmed` when an owner accepts the check |
| `measured_on` | Dataset → Instrument | `stated` on the QC/instrument record |
| `owns` | Person → ProtocolVersion | Person is **role only** (`assay_owner`). `stated` from the wiki owner role; `confirmed` after sign-off |

Do not invent an edge. If the join is missing, leave it off and open a decision.

## PR 2 QC records → `Dataset ran_under ProtocolVersion`

PR 2 (`cursor/lnp-qc-demo-e514`, not merged here) stores QC as `QCMeasurement` rows hung off a `Run`:

| PR 2 field | Ontology |
| --- | --- |
| `QCMeasurement.raw_file_uri` | `Dataset.path` |
| `QCMeasurement.measured_at` (calendar date) | `Dataset.date` |
| `Batch.operator_id` / `Step.operator_id` | `Dataset.owner` → `Person` with `role: "operator"` |
| `QCMeasurement.instrument_id` | `Instrument.id` |
| `QCMeasurement.assay` (`ribogreen_ee`) | `AssayType.id` (`ribogreen-ee`) |
| `QCMeasurement.run_id` → `Run.protocol_version_id` | join key for `ran_under` |
| `Run.protocol_version_id` → `ProtocolVersion.id` | structured-draft identity (semver family in PR 2) |
| `ProtocolVersion.parent_version` | `supersedes` (inferred from the parent pointer / history) |

The skill’s local QC envelope (`protocol_page_id`, `protocol_version`, structured `variant`) is the wiki-facing identity of that same join:

- `Dataset` is still the raw file.
- Ontology `ProtocolVersion.page_id` + `version` is the Confluence pair the skill already requires on every QC result.
- `valid_from` / `valid_to` come from `get_history` timestamps, not from the measurement.

PR 2’s `ProtocolVersion.id` (Crockford, semver family) and the wiki `(page_id, version)` are two identifiers for the same node once a lab records both. Until they do, `ran_under` can be `stated` against the structured-draft id and the wiki pair stays an open question.

Worked synthetic objects: [pr2-qc-mapping.json](../skills/protocol-consolidation/examples/SYNTHETIC-ribogreen-ee/pr2-qc-mapping.json). A PR 2-shaped `QCMeasurement` (`raw_file_uri`, `measured_at`, `run_id`) plus its `Run.protocol_version_id` becomes:

```json
{
  "dataset": {
    "id": "ds-north-plate-1",
    "path": "s3://simulated-prodqc/synthetic-ribogreen/north-plate-1.json",
    "date": "2026-01-15",
    "owner": "person:operator"
  },
  "edge": {
    "type": "ran_under",
    "from": { "kind": "dataset", "id": "ds-north-plate-1" },
    "to": { "kind": "protocol_version", "id": "pv-N101-v2" },
    "provenance": { "kind": "stated" }
  }
}
```

`stated` because the run record names the protocol version. The wiki pair on that node is page `N101` version `2` (skill QC envelope). The PR 2 Crockford id is recorded alongside as `pr2_protocol_version_id` until a lab treats them as one node.

## Methods vs wiki

A paper is not a protocol page. Extract the assay’s **fixed variant fields** from the methods section the same way a lab extracts its wiki (`npm run variant-table -- methods-vs-wiki`), then diff that table against the `ProtocolVersion` that was current on the **dates of linked datasets** (figures `derived_from` those datasets, `reported_in` the publication). Use the submission date only when there are no linked datasets.

- Do not send methods prose across labs. The export is the field table (values + `{file,line}`), same as cross-lab compare.
- Mismatches (formula, incubation, dilution, …) are check hits, not silent edits.
- Check id: `methods-vs-wiki` in `checks/ribogreen-ee.md`.
- Synthetic fixtures: `skills/protocol-consolidation/variant-table/fixtures/methods-vs-wiki/` (linked dataset `2025-09-15` selects wiki v2; no-dataset fallback uses submission `2025-11-01`).

JSON-LD / RO-Crate: [fair.md](fair.md) (**FAIR-ready export**, not a FAIR claim).
