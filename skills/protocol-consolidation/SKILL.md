---
name: protocol-consolidation
description: >-
  Consolidate versions of one assay protocol from a read-only Confluence Data
  Center wiki into one sourced draft. Use when mapping a wiki graph, grouping
  pages for the same assay, comparing versions against a shared checks library,
  drafting a merged protocol that never invents unread values, listing owner
  decisions, proposing a new generic check after a decision, extracting a
  structured variant field table, comparing two labs' tables, or diffing a
  paper's methods against the protocol version current before submission.
  Requires mcp-atlassian in READ_ONLY_MODE, the PR 4 Confluence extras
  (get_page_links, build_space_graph, get_history), and the protocol drafting
  CLI. Never write to the wiki. Never commit real lab protocol text.
---

# Protocol consolidation

Turn 2–5 local versions of **one assay family** into one sourced draft plus owner decisions. **Self-improvement is the point:** every resolved decision should become a candidate check in `checks/<assay-type>.md` so the next lab’s run catches that error class automatically.

Do not invent unread values. Do not write, move, or delete wiki pages. Do not commit real protocol text (use gitignored `runs/` and `input/` / `output/`). Share across labs **only** generic checks (`assay`, `rule`, `reason`), owner accept/reject verdicts (these weight the rules), anonymised outcome summaries **per structured variant**, **variant field tables** (values + `{file,line}`, no protocol text), and proposed check changes. Protocols and raw data never leave the lab. Headline metric: rate at which **new-lab** owners accept the checks. See [docs/cross-lab-loop.md](../../docs/cross-lab-loop.md).

## When to use

The owner named one assay family and the wiki spaces to stay inside. Claude Code, Codex, or Cursor has this skill loaded (see [references/loading.md](references/loading.md)).

## Tools

| Job | Use |
| --- | --- |
| Search, get page, children, tree, attachments | [mcp-atlassian](https://github.com/sooperset/mcp-atlassian) with `READ_ONLY_MODE=true` |
| Page graph, parsed outgoing links, version list | PR 4 extras: `build_space_graph`, `get_page_links`, `get_history` |
| Sourced drafts, comparison, `--summary-only` counts | Protocol drafting CLI (`npm run draft:protocol`) |
| Extract / compare fixed variant fields (no protocol text) | `npm run variant-table -- extract\|compare\|methods-vs-wiki` |

If a tool would POST/PUT/DELETE to Confluence, stop.

## Six steps (do them in order)

1. **Map the wiki (read-only).** [references/wiki-map.md](references/wiki-map.md) — graph, version counts, staleness, empty pages, bulk-import detection.
2. **Group pages about the same assay.** [references/grouping.md](references/grouping.md) — one family, cap 2–5 versions. Owner confirms the shortlist.
3. **Compare side by side + checklist.** Load `checks/<assay-type>.md`. Flag scientific error classes; do not “fix” numbers. [references/compare-and-checks.md](references/compare-and-checks.md).
4. **Draft one merged protocol.** Copy the shortlist into local `input/`. Run the drafting CLI. Every kept field needs a source pointer. Unread values become open questions. [references/draft-and-review.md](references/draft-and-review.md).
5. **List open decisions for the assay owner.** Conflicts, missing curves, formula disagreements, unmatched dilutions/volumes. No silent defaults.
6. **Human review.** Named owner resolves each decision (`accepted` / `corrected` / `deferred`) and records accept/reject **verdicts** on shared checks. Colleague reviews the comparison. Then write a **proposed check diff** for approval — the receiving lab adopts it only when **its** owner signs off. [references/self-improvement.md](references/self-improvement.md).

Worked **synthetic** example (RiboGreen encapsulation efficiency): [examples/SYNTHETIC-ribogreen-ee/](examples/SYNTHETIC-ribogreen-ee/). Not a real lab SOP.

## Cross-lab comparison mode

Each lab runs a **local** extract of the assay’s fixed variant fields, each with a `{file,line}` source pointer. Export **only** that field table. `compare` diffs two labs into a mismatch report. `methods-vs-wiki` diffs a paper’s methods extract against the protocol version current before the submission date. [references/compare-mode.md](references/compare-mode.md). Lab graph: [docs/lab-ontology.md](../../docs/lab-ontology.md).

Synthetic labs: [variant-table/fixtures/SYNTHETIC-lab-north](variant-table/fixtures/SYNTHETIC-lab-north/) and [SYNTHETIC-lab-south](variant-table/fixtures/SYNTHETIC-lab-south/).

## Run folder (private)

```
runs/<run-id>/          # gitignored; never commit
  wiki-map.json
  grouping.json
  checklist-hits.md
  input/                # 2–5 version files for the CLI
  output/               # *.draft.json, comparison.md, pitch-summary.json
  variant-table.json    # exportable field table (no protocol text)
  mismatch-report.json  # compare output
  open-decisions.md
  proposed-checks/*.diff
  qc-results.json          # each row: protocol_page_id, protocol_version, variant
  signed-off.json          # same provenance fields
  anonymised-counts.json
```

Pitch slides use `--summary-only` counts only. Cross-lab loop and JSON schemas: [docs/cross-lab-loop.md](../../docs/cross-lab-loop.md). Short reminder: [references/cross-lab.md](references/cross-lab.md). Provenance fields: [references/provenance-and-variant.md](references/provenance-and-variant.md).

## Hard rules

- Stay inside `CONFLUENCE_SPACES` / the owner’s named spaces.
- Institution-approved or local model only; otherwise skip infer and keep values unfilled.
- Keep “until clear” / observation-gated branches; do not flatten them.
- Units as UCUM when present in source.
- Every QC result and signed-off record must include `protocol_page_id`, `protocol_version`, and a structured `variant` (RiboGreen: `dye_dilution`, `triton_standard_curve`, `curve_well_volume_uL`, `sample_well_volume_uL`, `incubation_time_min`, `incubation_temperature_C`, `ee_formula`, `excitation_nm`, `emission_nm`). Free text only in `variant.notes`.
- Cross-lab export is the field table only — values plus `{file,line}`. No excerpts, notes, or protocol text.
- Check library changes are diffs + human approval, never silent edits. A new lab adopts a proposal only when its owner signs off.
- Generic issue classes belong in `checks/`. Lab-specific numbers and page titles do not.
