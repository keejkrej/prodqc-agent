# Step 1 — Map the wiki (read-only)

Stay inside the owner-named spaces. GET only.

## Graph

Call `build_space_graph` (PR 4) with `spaceKey` and a **local** `outputPath` under `runs/<run-id>/`. Nodes are pages; edges are parent plus storage links.

For hub pages in the shortlist, call `get_page_links` to see outgoing `ri:page` / `ri:attachment` edges. Use mcp-atlassian `confluence_search` / `confluence_get_page` / `confluence_get_page_children` for titles and bodies. Do not dump a whole space into the model context; work from the graph and fetch pages on demand.

## Version counts

For each candidate page, `get_history` (PR 4) returns the version **list** (number, author, date). Record `version_count`, latest `when`, and latest author. mcp-atlassian’s `confluence_get_page_history` fetches **one** version body — use it only after you know which version to read.

Keep at most the current revision plus 1–4 older ones that still describe the same assay. Export bodies locally as HTML/markdown plus a sidecar `{id, title, space, version, author, when}`.

## Staleness

Mark a page stale when its latest version is older than the **owner-supplied** threshold (ask; do not invent a lab policy). Stale is a signal for grouping and decisions, not an automatic discard.

## Empty pages

Treat as empty when `body.storage` is missing, whitespace-only, or only a title/placeholder with no method. List them; do not fill them in.

## Bulk-import detection

Suspect a bulk import when several of these hold together:

- many pages created in a short window
- same author
- `version_count = 1`
- similar titles or a shared prefix
- few or no outgoing `get_page_links` edges

Flag the cluster. Do not treat an import pack as N independent protocol versions without the owner.

## Write

`runs/<run-id>/wiki-map.json` (private). Include counts the later anonymised summary can reuse: page count, edge count, empty count, stale count, bulk-import-suspect count. No need to paste full bodies into that file.
