# FAIR-ready export

This skill produces a **FAIR-ready export**, not a FAIR dataset. Do not call the crate or the ontology “FAIR” until each released protocol version has a DOI and a license.

JSON-LD context: `skills/protocol-consolidation/schemas/lab-ontology.context.jsonld`. RO-Crate 1.1 command:

```
npm run variant-table -- ro-crate \
  --ontology skills/protocol-consolidation/examples/SYNTHETIC-ribogreen-ee/lab-ontology.json \
  --protocol pv-N101-v2 \
  --out /tmp/fair-ready-crate
```

The crate bundles one `ProtocolVersion` with datasets that `ran_under` it and publications reached via `Figure derived_from Dataset` / `reported_in`. Validation is the in-repo RO-Crate 1.1 structural checks (`validateRoCrate11`). `rocrate-validator` was not available in this environment; that function is the equivalent.

Recommended licensing (not yet attached to a released protocol version):

- **Code** (this repo, extractors, schemas as software): Apache-2.0
- **Released protocol text and metadata exports** (RO-Crate, JSON-LD, field tables once published): CC-BY-4.0

## F/A/I/R

| | Met now (FAIR-ready export) | Needed before calling it FAIR |
| --- | --- | --- |
| **F**indable | Local identifiers (`page_id` + `version`, dataset path, synthetic DOI on the example publication). JSON-LD `@id`s in the crate. | A **DOI per released protocol version** (Zenodo or protocols.io). Indexing outside the lab. |
| **A**ccessible | Crate is a directory of JSON + README that can be copied. Protocol pages themselves stay in the lab. | A public landing page for each DOI. Authentication story for any remaining lab-private files. |
| **I**nteroperable | W3C PROV-O (`ProtocolVersion` → `prov:Plan`, `Dataset` → `prov:Entity`, `ran_under` → `prov:qualifiedAssociation` / `hadPlan`, `supersedes` → `prov:wasRevisionOf`, confirmed-by → `prov:wasAttributedTo`). OBI protocol `OBI:0000272`, assay `OBI:0000070`. Triton X-100 `CHEBI:9750`. Units as UCUM (`ug/mL`, `%`, `min`, `Cel`, `nm`, `uL`). RO-Crate 1.1 `@context`. | RiboGreen: **no ChEBI term** (TODO; proprietary Quant-iT dye; do not invent an ID). Broader term mappings as other assays appear. |
| **R**eusable | Structured variant fields, provenance on every edge, CC-BY-4.0 marked on the synthetic crate as the intended metadata licence. | An actual **license** chosen and published on the DOI record. Owner sign-off (`status: proposed` until then). |

## PROV-O / OBI map

| Ontology | Term |
| --- | --- |
| ProtocolVersion | `prov:Plan` and OBI protocol `OBI:0000272` |
| AssayType | OBI assay `OBI:0000070` |
| Dataset | `prov:Entity` |
| `ran_under` | `prov:qualifiedAssociation` with `prov:hadPlan` |
| `supersedes` | `prov:wasRevisionOf` |
| provenance `confirmed` / `owns` | `prov:wasAttributedTo` |
| Triton X-100 | `CHEBI:9750` |
| RiboGreen | TODO — no ChEBI ID |

Optional instance fields (used by the JSON-LD export; omit or null when unknown; never invent):

- `AssayType.obi_id` — `OBI:0000070` on the synthetic RiboGreen assay
- `Reagent.chebi_id` / variant `reagents.triton_x100.chebi_id` — `CHEBI:9750`
- `reagents.ribogreen.chebi_id` — `null`
