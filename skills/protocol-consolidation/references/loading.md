# Loading this skill (Claude Code, Codex, Cursor)

Canonical files live at `skills/protocol-consolidation/` (folder name = skill `name`). Hosts discover skills from other directories, so this repo also ships **symlinks**:

| Host | Project path that loads the skill |
| --- | --- |
| Codex | `.agents/skills/protocol-consolidation` → `skills/protocol-consolidation` |
| Claude Code | `.claude/skills/protocol-consolidation` → `skills/protocol-consolidation` |
| Cursor | `.agents/skills/` (native) and `.claude/skills/` (compatibility) |

User-level copies (optional, same folder layout):

- Claude Code: `~/.claude/skills/protocol-consolidation`
- Codex: `~/.agents/skills/protocol-consolidation`
- Cursor: `~/.cursor/skills/protocol-consolidation` or `~/.agents/skills/protocol-consolidation`

After clone, confirm the skill appears in the client’s skill list, then invoke it (`/protocol-consolidation` or a natural-language request to consolidate an assay protocol).

MCP the skill expects on the **same machine** (read-only):

1. mcp-atlassian with `READ_ONLY_MODE=true` and a PAT (or basic if PATs are disabled).
2. `packages/confluence-mcp` from PR 4 (`get_page_links`, `build_space_graph`, `get_history`).

The drafting CLI is a local npm script in this repo (protocol-draft PR). Point `--input` / `--output` at the private `runs/<run-id>/` folders, never at the wiki or a NAS root.
