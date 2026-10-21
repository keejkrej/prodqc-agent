# Collecting protocol versions (lab pilot)

One-page method for gathering **2–5 versions of one protocol family** from two local sources into the drafting CLI’s `input/` folder. This is **not** a full wiki or file-share migration, and this repository does not include collector code.

**Constraints (non-negotiable)**

- **Read-only.** Do not write, move, rename, or delete anything on the wiki or the NAS.
- **Lab machine only.** Run the work on the laptop or workstation that already has the mount and the user’s own credentials.
- **Models.** Any AI step uses an **institution-approved** or **local** model. If that is not available, **do not run the AI steps** — otherwise protocol text **leaves the lab**.
- **Scope.** One protocol family first (the family the owner names). Do not crawl the whole wiki or share.
- **Privacy.** Copies land in local `input/` / `output/` (gitignored). Never commit real protocol text.

Use the user’s **own login** or a **personal access token**. Do not share a shared service account. Scope the token to the relevant wiki spaces only.

---

## 1. Self-hosted Confluence wiki (old, on-prem)

Prefer the **REST API**, read-only:

1. Confirm the instance is reachable from the lab machine. Authenticate as the user (`/rest/api/user/current` or equivalent).
2. **Search** with CQL, limited to the named spaces and protocol-family terms the owner supplies (`/rest/api/content/search?cql=...`). Do not search every space.
3. **Fetch** matching pages and their history via `/rest/api/content/{id}` with `expand` for `body.storage`, `version`, `history`, and `ancestors` (or the equivalent history endpoint). Keep **author**, **version number**, and **when** for each revision you retain.
4. Keep at most a handful of revisions per page (current plus 1–4 older ones that still describe the same family). Export body as HTML or storage XML plus a sidecar of id, title, space, version, author, when.
5. If the REST API is **disabled**, take a **single-space HTML/XML space export** that includes version history, still read-only, still one space. Unzip it locally. Do not export the whole site.
6. **Browser automation is a fallback only** when the API is off and a space export is not available. Use the user’s own session; do not scrape other users’ pages; stop if a login wall or CAPTCHA appears.

Stop if the token can see spaces outside the agreed list.

---

## 2. NAS mounted on the work laptop

Work on the **already-mounted** share. Do not copy the whole volume.

### a) Plain metadata index (no AI)

Walk the agreed subtree. Record only **name, type, size, mtime**, and relative path. Skip:

- raw instrument data and vendor run folders
- files over a size cap (set with the owner; tens of MB, not GB)
- obvious binaries, installers, and media

Write a local index (CSV or JSON). No model, no file bodies.

### b) Cheap-model triage (filename + first page)

Only if an institution-approved or local model is available. For index rows that look like documents, send **filename and the first page / first few KB of text** (not the whole file). Classify as `protocol` | `run_sheet` | `ignore`.

A **human checks a sample** of each class (including ignores) before anything proceeds. Wrong class → correct the label; do not trust the model alone.

If no approved/local model: **skip this step.** The owner shortlists from the metadata index by hand. Otherwise text leaves the lab.

### c) Drafting CLI on the shortlist

Copy only the shortlisted protocol files (2–5 versions of the one family) into local `input/`. Run the drafting CLI there. Do not point the CLI at the NAS root.

### d) Version comparison across both sources

Treat wiki revisions and NAS files as one pool of versions of the **same family**. Run the CLI comparison (and `--summary-only` for counts). Note which versions came from wiki vs NAS **in the private report**, not on a public slide.

### e) Owner and colleague review

The **protocol owner** confirms the shortlist is the right family and the right 2–5 versions. A **colleague** reviews the comparison (`--review` counts: accepted / corrected / deferred). Open questions stay questions until a named person signs.

---

## Order of work

1. Name the protocol family and the wiki spaces / NAS subtree with the owner.
2. Wiki: API (or one-space export); keep authors and history.
3. NAS: metadata index → (optional) cheap triage with a human sample → shortlist.
4. Merge shortlists; cap at 2–5 versions.
5. Draft, compare, owner + colleague review.
6. Pitch slides use `--summary-only` counts only.
