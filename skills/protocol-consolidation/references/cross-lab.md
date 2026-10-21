# Cross-lab sharing (short)

Full loop, headline metric, and JSON schemas: [docs/cross-lab-loop.md](../../../docs/cross-lab-loop.md).

Labs may share:

- Shared checks: `{ assay, rule, reason }`
- Owner `accept` / `reject` verdicts (these **weight** the rules)
- Anonymised outcome summaries **per structured variant** (counts, no values, no `notes`)
- Proposed changes — adopted only when the **receiving** lab’s owner signs off

Labs must not share protocols, drafts, `protocol_page_id`, raw QC values, or variant `notes`.

Headline metric: **new-lab check accept rate** (`lab_novelty: "new"`).
