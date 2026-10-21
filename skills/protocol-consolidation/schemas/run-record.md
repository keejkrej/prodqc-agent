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

## qc-results.json / signed-off.json

Each object **must** include `protocol_page_id`, `protocol_version`, and `variant` (see [qc-result.schema.json](qc-result.schema.json), [signed-off-record.schema.json](signed-off-record.schema.json)). RiboGreen `variant`: `dye_dilution`, `triton_standard_curve`, `well_volume_uL`, `notes`. These files never leave the lab.

## anonymised-counts.json

Shareable run roll-up: `assay_type`, `library_version`, `versions_compared`, `checks[]` (`id`, `hits`, `unknown`), `decisions` counts, `proposed_checks` count. No titles or values.

Per-variant shareable counts use [outcome-summary.schema.json](outcome-summary.schema.json). Shared checks / verdicts: [check.schema.json](check.schema.json), [verdict.schema.json](verdict.schema.json). Loop: [docs/cross-lab-loop.md](../../../docs/cross-lab-loop.md).

## proposed-checks/*.diff

Unified diffs against `skills/protocol-consolidation/checks/<assay-type>.md` and `CHANGELOG.md`. Pair with a `ProposedChange` JSON. A receiving lab adopts only when its owner signs off.
