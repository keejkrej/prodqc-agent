# Variant table (cross-lab compare)

Each lab extracts the assay’s **fixed fields** from its own protocol pages and exports **only that table** (value + `{file,line}`). No protocol text, excerpts, or `notes`. `compare` diffs two tables. `methods-vs-wiki` diffs a paper’s methods extract against the protocol version that was current before the submission date.

```
npm run variant-table -- extract --lab SYNTHETIC-lab-north --assay ribogreen-ee \
  --input skills/protocol-consolidation/variant-table/fixtures/SYNTHETIC-lab-north \
  --out /tmp/north.table.json

npm run variant-table -- extract --lab SYNTHETIC-lab-south --assay ribogreen-ee \
  --input skills/protocol-consolidation/variant-table/fixtures/SYNTHETIC-lab-south \
  --out /tmp/south.table.json

npm run variant-table -- compare --left /tmp/north.table.json --right /tmp/south.table.json

npm run variant-table -- methods-vs-wiki \
  --methods skills/protocol-consolidation/variant-table/fixtures/methods-vs-wiki/paper \
  --versions skills/protocol-consolidation/variant-table/fixtures/methods-vs-wiki/versions.json \
  --submitted 2025-11-01
```

Extraction is deterministic (regex). Unread fields are omitted, never invented. EE formulas collapse to `1-(free/total)`, `total/free`, or `free/total`. Source file names should be opaque ids (`page-N101.md`), not titles.

RiboGreen fields: `dye_dilution`, `triton_standard_curve`, `curve_well_volume_uL`, `sample_well_volume_uL`, `incubation_time_min`, `incubation_temperature_C`, `ee_formula`, `excitation_nm`, `emission_nm`.

Fixtures are fictional labs (`SYNTHETIC-lab-north`, `SYNTHETIC-lab-south`) plus a fictional paper. Tests include a leak check that the export contains none of the source-page prose.
