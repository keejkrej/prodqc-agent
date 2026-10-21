# Self-improvement loop

The shared checks library is how this skill gets better **without sharing lab content**.

## Versioning

- Files: `checks/<assay-type>.md` (kebab-case assay class, not a lab’s page title).
- Each file has `library_version` in frontmatter (semver).
- `checks/CHANGELOG.md` records every **accepted** addition: version bump, check id, one-line generic description, date, approving person. No page titles, no numeric SOP values.

## After a decision is resolved

For each owner resolution that names a **generic error class** the library missed:

1. Draft a new check (or a tighter existing one) using `checks/_template.md`.
2. Write a unified diff under `runs/<run-id>/proposed-checks/<check-id>.diff` against `checks/<assay-type>.md` and a CHANGELOG hunk.
3. Show the diff to a human. They approve, edit, or reject.
4. Only an approved diff is applied. That is the next lab’s automatic catch.

Do **not** encode the owner’s chosen dilution or volume as a universal constant unless they explicitly mark it as a generic class (for example “flag any undocumented dilution mismatch”), not a site spec.

## Anonymised counts (shareable)

`runs/<run-id>/anonymised-counts.json`:

```json
{
  "assay_type": "ribogreen-ee",
  "library_version": "0.1.0",
  "versions_compared": 3,
  "checks": [
    { "id": "missing-dual-standard-curves", "hits": 1, "unknown": 0 },
    { "id": "inverted-ee-formula", "hits": 2, "unknown": 0 }
  ],
  "decisions": { "accepted": 2, "corrected": 1, "deferred": 0 },
  "proposed_checks": 1
}
```

No titles, excerpts, authors, spaces, or measured values. This object is what may leave the lab besides the generic `checks/` files.

## What not to automate yet

Do not stand up an ACP orchestrator, fan-out, or cross-run aggregator until **2–3 assay families** have completed this skill by hand. See [docs/acp-orchestrator.md](../../../docs/acp-orchestrator.md).
