# Cross-lab comparison mode

Two labs can compare **method shape** without sending protocol pages.

1. Each lab copies the shortlisted pages into a private `runs/<run-id>/input/` (already gitignored).
2. Local extract: `npm run variant-table -- extract --lab <opaque-lab-id> --assay ribogreen-ee --input runs/<run-id>/input --out runs/<run-id>/variant-table.json`.
3. Export **only** that JSON (or a copy with opaque file names). It is a field table: `{ lab_id, assay, fields[name]={ value, source:{ file, line } } }`.
4. `npm run variant-table -- compare --left a.json --right b.json` writes a mismatch report (`value_diff` / `missing_left` / `missing_right`).

Do not attach excerpts, `notes`, drafts, or `comparison.md`. Source `file` should be a page id, not a title.

Unread fields are omitted. Do not fill a dilution, volume, formula, incubation, or wavelength that the page did not state.

## Methods vs wiki

Same extractor, different right-hand side. A paper’s methods section is extracted to the same field table and compared to the `ProtocolVersion` that was current on the **dates of linked datasets** (figures `derived_from` those datasets). Use the publication’s submission date only when there are no linked datasets. See [docs/lab-ontology.md](../../../docs/lab-ontology.md).

```
npm run variant-table -- methods-vs-wiki \
  --methods runs/<run-id>/paper-methods.md \
  --versions runs/<run-id>/protocol-versions.json \
  --submitted 2025-11-01
```

Synthetic walkthrough: [../variant-table/fixtures/](../variant-table/fixtures/).
