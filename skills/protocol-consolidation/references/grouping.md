# Step 2 — Group pages about the same assay

One run = **one assay family**. The owner names it (for example “RiboGreen encapsulation efficiency”, not “all QC”).

## Signals (use together)

- Title and label overlap (mcp-atlassian search in the allowlisted spaces).
- Parent / child edges and `get_page_links` edges from the graph.
- Shared attachments (standard-curve spreadsheets, plate maps).
- History authors who repeatedly touch the same cluster.
- NAS / local files the owner already shortlisted (if any) — same family, not a second crawl.

## Cap

2–5 versions in the shortlist. Prefer:

1. Current page version.
2. Last version that still describes the same method.
3. One divergent copy (lab notes, imported SOP, or a dated duplicate).

Drop empty pages and bulk-import clones unless the owner says a clone is the real SOP.

## Confirm

Show the owner the shortlist as **titles, dates, version numbers, and source (wiki vs file)** — not full bodies. Do not proceed to compare/draft until they confirm the family and the 2–5 versions.

Write `runs/<run-id>/grouping.json` with `{ family, assay_type, versions: [{ id, title, when, source }] }`. `assay_type` must match a file in `checks/` (for example `ribogreen-ee`) or you will create a new check file **as a proposed diff**, not by editing the library in place.
