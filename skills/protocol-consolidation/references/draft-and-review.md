# Steps 4–6 — Draft, decisions, human review

## 4. Draft one merged protocol (never invent)

Copy the 2–5 confirmed versions into `runs/<run-id>/input/` as txt/md (or PDF with extractable text). Run the drafting CLI from the repo that contains it:

```bash
PROTOCOL_DRAFT_MODEL="<model-key>" npm run draft:protocol -- \
  --input runs/<run-id>/input \
  --output runs/<run-id>/output
```

The CLI:

- Writes one sourced `*.draft.json` per version plus `comparison.md`.
- Attaches a source pointer (`file`, `line`, `excerpt`) to every kept field.
- **Drops unread values** instead of filling them in.
- Keeps observation-gated steps (“until clear”) as gates/branches.
- Stores units as UCUM when the source has them.

`--summary-only` prints counts only (versions, steps, differences by category, open questions by category). That is what may go on a pitch slide. Optional `--review <file>` tallies colleague outcomes `accepted` | `corrected` | `deferred`.

If `PROTOCOL_DRAFT_MODEL` is not an institution-approved or local model, **do not run infer**. Split the shortlist by hand into open questions.

There is no merged `*.draft.json` until the owner resolves conflicts. The “merged protocol” in this skill is: CLI drafts + checklist hits + `open-decisions.md`. After review, a human (not the agent) chooses which sourced values survive.

When this family later produces QC results or sign-offs, each record must carry `protocol_page_id`, `protocol_version`, and the assay’s structured `variant` ([provenance-and-variant.md](provenance-and-variant.md)). Do not stash method choices in a notes blob.

## 5. Open decisions for the assay owner

Write `runs/<run-id>/open-decisions.md`. Each item:

- `id` (stable, for example `D-ee-formula`)
- `check_id` if it came from the library
- versions that disagree (ids only, plus excerpts)
- question for the owner (one sentence)
- `status`: `open` until they answer

Do not pick a default formula, dilution, or volume.

## 6. Human review

1. **Owner** sets each decision to `accepted` | `corrected` | `deferred`, with their name and a timestamp (local). For each shared check they also record a shareable `accept` / `reject` **verdict** (no name on the verdict object).
2. **Colleague** reviews `comparison.md` (and `--review` JSON if they use it).
3. Only then write `runs/<run-id>/proposed-checks/*.diff` (and a `ProposedChange` JSON) from resolved decisions (see [self-improvement.md](self-improvement.md)).
4. A **receiving lab** applies that proposal only when **its** owner signs off. The agent does not silently edit `checks/`.

Stop if the owner defers everything: keep the drafts private; do not propose checks from guesses.
