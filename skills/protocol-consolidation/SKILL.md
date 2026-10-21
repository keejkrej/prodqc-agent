---
name: protocol-consolidation
description: >-
  Consolidate versions of one assay protocol from a read-only Confluence Data
  Center wiki into one sourced draft. Use when mapping a wiki graph, grouping
  pages for the same assay, comparing versions against a shared checks library,
  drafting a merged protocol that never invents unread values, listing owner
  decisions, or proposing a new generic check after a decision. Requires
  mcp-atlassian in READ_ONLY_MODE, the PR 4 Confluence extras
  (get_page_links, build_space_graph, get_history), and the protocol drafting
  CLI. Never write to the wiki. Never commit real lab protocol text.
---

# Protocol consolidation

Turn 2–5 local versions of **one assay family** into one sourced draft plus owner decisions. **Self-improvement is the point:** every resolved decision should become a candidate check in `checks/<assay-type>.md` so the next lab’s run catches that error class automatically.

Do not invent unread values. Do not write, move, or delete wiki pages. Do not commit real protocol text (use gitignored `runs/` and `input/` / `output/`). Share across labs **only** generic checks and anonymised counts.

## When to use

The owner named one assay family and the wiki spaces to stay inside. Claude Code, Codex, or Cursor has this skill loaded (see [references/loading.md](references/loading.md)).

## Tools

| Job | Use |
| --- | --- |
| Search, get page, children, tree, attachments | [mcp-atlassian](https://github.com/sooperset/mcp-atlassian) with `READ_ONLY_MODE=true` |
| Page graph, parsed outgoing links, version list | PR 4 extras: `build_space_graph`, `get_page_links`, `get_history` |
| Sourced drafts, comparison, `--summary-only` counts | Protocol drafting CLI (`npm run draft:protocol`) |

If a tool would POST/PUT/DELETE to Confluence, stop.

## Six steps (do them in order)

1. **Map the wiki (read-only).** [references/wiki-map.md](references/wiki-map.md) — graph, version counts, staleness, empty pages, bulk-import detection.
2. **Group pages about the same assay.** [references/grouping.md](references/grouping.md) — one family, cap 2–5 versions. Owner confirms the shortlist.
3. **Compare side by side + checklist.** Load `checks/<assay-type>.md`. Flag scientific error classes; do not “fix” numbers. [references/compare-and-checks.md](references/compare-and-checks.md).
4. **Draft one merged protocol.** Copy the shortlist into local `input/`. Run the drafting CLI. Every kept field needs a source pointer. Unread values become open questions. [references/draft-and-review.md](references/draft-and-review.md).
5. **List open decisions for the assay owner.** Conflicts, missing curves, formula disagreements, unmatched dilutions/volumes. No silent defaults.
6. **Human review.** Named owner resolves each decision (`accepted` / `corrected` / `deferred`). Colleague reviews the comparison. Then write a **proposed check diff** for approval — do not edit `checks/` until a human accepts the diff. [references/self-improvement.md](references/self-improvement.md).

Worked **synthetic** example (RiboGreen encapsulation efficiency): [examples/SYNTHETIC-ribogreen-ee/](examples/SYNTHETIC-ribogreen-ee/). Not a real lab SOP.

## Run folder (private)

```
runs/<run-id>/          # gitignored; never commit
  wiki-map.json
  grouping.json
  checklist-hits.md
  input/                # 2–5 version files for the CLI
  output/               # *.draft.json, comparison.md, pitch-summary.json
  open-decisions.md
  proposed-checks/*.diff
  anonymised-counts.json
```

Pitch slides use `--summary-only` counts only. Cross-lab sharing rules: [references/cross-lab.md](references/cross-lab.md).

## Hard rules

- Stay inside `CONFLUENCE_SPACES` / the owner’s named spaces.
- Institution-approved or local model only; otherwise skip infer and keep values unfilled.
- Keep “until clear” / observation-gated branches; do not flatten them.
- Units as UCUM when present in source.
- Check library changes are diffs + human approval, never silent edits.
- Generic issue classes belong in `checks/`. Lab-specific numbers and page titles do not.
