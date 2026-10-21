# Cross-lab sharing (short)

Full loop, headline metric, and JSON schemas: [docs/cross-lab-loop.md](../../../docs/cross-lab-loop.md). Compare mode: [compare-mode.md](compare-mode.md). Lab ontology (local): [docs/lab-ontology.md](../../../docs/lab-ontology.md).

Labs may share:

- Shared checks: `{ assay, rule, reason }`
- Owner `accept` / `reject` verdicts (these **weight** the rules)
- Anonymised outcome summaries **per structured variant** (counts, no values, no `notes`)
- Variant **field tables** (`lab_id`, `assay`, `fields[name]={value, source:{file,line}}`) — no protocol text
- Proposed changes — adopted only when the **receiving** lab’s owner signs off

Labs must not share protocols, drafts, `protocol_page_id`, raw QC values, variant `notes`, or excerpts.

Headline metric: **new-lab check accept rate** (`lab_novelty: "new"`).
