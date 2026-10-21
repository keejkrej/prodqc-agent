# Private run record

Write these under gitignored `runs/<run-id>/`. Do not commit them when they contain real wiki text.

## wiki-map.json

```json
{
  "spaceKey": "<allowlisted-key>",
  "generatedAt": "<ISO-8601>",
  "pageCount": 0,
  "edgeCount": 0,
  "emptyCount": 0,
  "staleCount": 0,
  "bulkImportSuspectCount": 0,
  "stalenessThreshold": "<owner-supplied>"
}
```

## grouping.json

```json
{
  "family": "<owner-named family>",
  "assay_type": "ribogreen-ee",
  "versions": [
    { "id": "<page-or-file-id>", "title": "<private>", "when": "<ISO-8601>", "source": "wiki|file", "version": 1 }
  ]
}
```

## open-decisions.md

One heading per `D-*` id: check_id, excerpts, owner question, `status` (`open` | `accepted` | `corrected` | `deferred`), owner name, timestamp.

## anonymised-counts.json

Shareable. Keys: `assay_type`, `library_version`, `versions_compared`, `checks[]` (`id`, `hits`, `unknown`), `decisions` counts, `proposed_checks` count. No titles or values.

## proposed-checks/*.diff

Unified diffs against `skills/protocol-consolidation/checks/<assay-type>.md` and `CHANGELOG.md`. Apply only after human approval.
