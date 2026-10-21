# ACP orchestrator (later)

One page on what an orchestrator over the [Agent Client Protocol](https://agentclientprotocol.com/) would add. **Do not build it yet.** Run this skill by hand on **2–3 assay families** first. Only then is an orchestrator worth the moving parts.

## What ACP is

ACP is a JSON-RPC-over-stdio contract so a **client** can drive a **coding agent** (sessions, prompts, tool calls, permissions, diffs) without owning that agent’s runtime. Adapters already exist for the tools labs actually subscribe to:

- Claude Code / Claude Agent SDK: [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)
- Codex: [`codex-acp`](https://github.com/agentclientprotocol/codex-acp)

The orchestrator would be that client. It would **not** replace Claude Code or Codex, and it would **not** hold a shared model API key for the lab. It would start the user’s own agent through the adapter, on **their** subscription, on **their** machine, with the same read-only MCP servers and this skill loaded.

## What it would add (after 2–3 manual assays)

Once the skill’s six steps and the checks-library diff loop are boringly familiar:

1. **Drive the user’s agent** — open an ACP session per assay family, inject this skill, pass the owner-named spaces and assay type, keep permissions on a short allowlist (local files + GET-only Confluence MCP).
2. **Fan out batches** — one child session per assay (or per space cluster), not one giant crawl. Collect `runs/<run-id>/` folders as they finish.
3. **Collect drafts** — gather CLI `comparison.md` and `--summary-only` counts; never lift protocol bodies into a central model account.
4. **Queue reviews** — turn `open-decisions.md` into a single owner queue (accepted / corrected / deferred) and a colleague review queue for comparisons.
5. **Aggregate check proposals** — merge `proposed-checks/*.diff` across runs by `assay_type` + `check_id`, dedupe generic wording, and present **one** human-approval batch for `checks/` + `CHANGELOG.md`. Still no silent library edits.
6. **Cross-lab loop** — roll up shared checks, verdicts (rule weights), and per-variant outcome summaries. Headline metric is new-lab check accept rate. See [cross-lab-loop.md](cross-lab-loop.md). Still no protocols or raw data.

## What it must not do

- Write to Confluence.
- Bypass owner sign-off or auto-merge check diffs.
- Send wiki bodies to a hosted orchestrator account. The agent stays local to the user’s ACP adapter.
- Start before two or three assays have gone through `skills/protocol-consolidation/` without it. Those runs are what teach which steps are slow, which checks fire, and whether proposed diffs are actually generic.

## Build trigger

Ship the orchestrator only after:

- 2–3 assay families completed with this skill
- at least one accepted check-library diff from a real (private) run
- the owner still wants fan-out more than they want another manual `/protocol-consolidation`
