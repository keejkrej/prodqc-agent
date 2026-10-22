# FAIR-ready export

This skill produces a **FAIR-ready export**. Do not call the crate, the ontology, or a released protocol **FAIR-compliant**. Synthetic data only.

JSON-LD context: `skills/protocol-consolidation/schemas/lab-ontology.context.jsonld`. RO-Crate 1.1 command:

```
npm run variant-table -- ro-crate \
  --ontology skills/protocol-consolidation/examples/SYNTHETIC-ribogreen-ee/lab-ontology.json \
  --protocol pv-N101-v2 \
  --out /tmp/fair-ready-crate
```

The crate bundles one `ProtocolVersion` with **Runs** that `ran_under` it, Datasets `generated_by` those Runs, and publications reached via `Figure derived_from Dataset` / `reported_in`. Validation is the in-repo RO-Crate 1.1 structural checks (`validateRoCrate11`). `rocrate-validator` was not available in this environment; that function is the equivalent.

Recommended licensing (not yet attached to a released protocol version):

- **Code** (this repo, extractors, schemas as software): Apache-2.0
- **Released protocol text and metadata exports** (RO-Crate, JSON-LD, field tables once published): CC-BY-4.0

## F/A/I/R

| | Met now (FAIR-ready export) | Needed before calling it FAIR |
| --- | --- | --- |
| **F**indable | Local identifiers (`page_id` + `version`, run id, dataset path, synthetic DOI on the example publication). JSON-LD `@id`s in the crate. | A **DOI per released protocol version** (Zenodo or protocols.io). Indexing outside the lab. |
| **A**ccessible | Crate is a directory of JSON + README that can be copied. Protocol pages themselves stay in the lab. | A public landing page for each DOI. Authentication story for any remaining lab-private files. |
| **I**nteroperable | W3C PROV-O (`Run` → `prov:Activity`, `ProtocolVersion` → `prov:Plan`, `Dataset` → `prov:Entity`, Dataset `generated_by` Run, Run `ran_under` Plan via `qualifiedAssociation`/`hadPlan`, Run `measured_on` Instrument via `prov:used`, `supersedes` → `wasRevisionOf`). Owner vs approver: `prov:qualifiedAttribution` + `prov:hadRole` (`assay_owner` / `approver`). OBI protocol `OBI:0000272`, assay `OBI:0000070`. Triton X-100 `CHEBI:9750`. Units: UCUM codes as `schema:unitCode` under namespace `http://unitsofmeasure.org/` (HEAD 200) plus QUDT IRIs. RO-Crate 1.1 `@context`. | RiboGreen: **no ChEBI term** (TODO; proprietary Quant-iT dye; do not invent an ID). Broader term mappings as other assays appear. |
| **R**eusable | Structured variant fields, provenance on every edge, CC-BY-4.0 marked on the synthetic crate as the intended metadata licence. | An actual **license** chosen and published on the DOI record. Owner sign-off (`status: proposed` until then). |

## PROV-O / OBI map

| Ontology | Term |
| --- | --- |
| Run | `prov:Activity` |
| ProtocolVersion | `prov:Plan` and OBI protocol `OBI:0000272` |
| AssayType | OBI assay `OBI:0000070` |
| Dataset | `prov:Entity` |
| `generated_by` | Dataset `prov:wasGeneratedBy` Run |
| `ran_under` | Run `prov:used` ProtocolVersion, and Run `prov:qualifiedAssociation` / `prov:hadPlan` |
| `measured_on` | Run `prov:used` Instrument |
| `supersedes` | `prov:wasRevisionOf` |
| `owns` | `prov:qualifiedAttribution` with `prov:hadRole` `assay_owner` |
| `approved` | `prov:qualifiedAttribution` with `prov:hadRole` `approver` |
| Triton X-100 | `CHEBI:9750` |
| RiboGreen | TODO — no ChEBI ID |
| Units | UCUM `http://unitsofmeasure.org/` + `schema:unitCode`; QUDT IRIs for the same codes |

Optional instance fields (used by the JSON-LD export; omit or null when unknown; never invent):

- `AssayType.obi_id` — `OBI:0000070` on the synthetic RiboGreen assay
- `Reagent.chebi_id` / variant `reagents.triton_x100.chebi_id` — `CHEBI:9750`
- `reagents.ribogreen.chebi_id` — `null`
