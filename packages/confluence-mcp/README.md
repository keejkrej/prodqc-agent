# confluence-mcp

Three **GET-only** MCP tools for **Confluence Data Center 9.2.x** that [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian) does not provide. Browse, search, get page, children, tree, and attachments stay on mcp-atlassian.

This process runs on your machine. Page titles, bodies, and graph files leave the laptop only if the MCP client you attach (Cursor, Claude Desktop, or another model host) sends them to a model.

## Try mcp-atlassian first

On Data Center 9.2, run mcp-atlassian with `READ_ONLY_MODE=true`. It already covers CQL search, get page, children, space page tree, attachments, and fetching a specific historical version, with PAT or basic auth.

```json
{
  "mcpServers": {
    "mcp-atlassian": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "CONFLUENCE_URL": "https://confluence.example.com",
        "CONFLUENCE_PERSONAL_TOKEN": "<pat>",
        "READ_ONLY_MODE": "true"
      }
    }
  }
}
```

## What this package adds

| Tool | Why it exists here |
| --- | --- |
| `get_page_links` | Parse `ac:link` / `ri:page` / `ri:attachment` in `body.storage` into resolved outgoing edges |
| `build_space_graph` | Nodes = pages, edges = parent + storage links, JSON written to a local file |
| `get_history` | Version **list** with author and date (mcp-atlassian's `confluence_get_page_history` returns one version's body, not the changelog) |

There are no write endpoints and no duplicate browse tools.

`CONFLUENCE_SPACES` (comma-separated keys) is an allowlist enforced on every call: explicit CQL `space=` / `space in (...)` values outside the list are rejected, other CQL is AND-ed with the list, and page fetches whose space is not listed return 403.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONFLUENCE_BASE_URL` | yes | Origin of Confluence Data Center, e.g. `https://confluence.example.com` |
| `CONFLUENCE_PAT` | preferred | Personal access token (`Authorization: Bearer`) |
| `CONFLUENCE_USER` + `CONFLUENCE_PASSWORD` | fallback | Basic auth if the admin has disabled PATs. Ignored when `CONFLUENCE_PAT` is set |
| `CONFLUENCE_SPACES` | no | Allowlist, e.g. `SPACE1,SPACE2` |
| `CONFLUENCE_MIN_INTERVAL_MS` | no | Gap between GETs (default `150`) |
| `CONFLUENCE_TIMEOUT_MS` | no | Per-request timeout (default `30000`) |
| `CONFLUENCE_MAX_RETRIES` | no | Extra attempts on timeout / `429` (default `3`). `429` honors `Retry-After`, capped at 10s |

401 / 403 / 404 come back as explicit errors that mention credentials, the allowlist, or a missing page.

## Run it locally

Node 20+. From this package:

```bash
cd packages/confluence-mcp
npm install
npm test
npm run build
```

On filesystems that reject `npm install` in the working tree, use `npm run deps:ext4` instead, then `npm test` and `npm run build`.

```bash
export CONFLUENCE_BASE_URL="https://confluence.example.com"
export CONFLUENCE_PAT="your-personal-access-token"
export CONFLUENCE_SPACES="SPACE1,SPACE2"
node dist/main.js
```

The process waits on stdin/stdout. That is the MCP transport.

## Add it to Cursor

`~/.cursor/mcp.json` or project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "confluence-graph": {
      "command": "node",
      "args": ["/absolute/path/to/packages/confluence-mcp/dist/main.js"],
      "env": {
        "CONFLUENCE_BASE_URL": "https://confluence.example.com",
        "CONFLUENCE_PAT": "<pat>",
        "CONFLUENCE_SPACES": "SPACE1,SPACE2"
      }
    }
  }
}
```

Run this beside mcp-atlassian: mcp-atlassian does search/get/children/attachments; this server does links, graph, and the version list.

If PATs are disabled, omit `CONFLUENCE_PAT` and set `CONFLUENCE_USER` / `CONFLUENCE_PASSWORD` instead.

## Add it to Claude Desktop

Same `mcpServers` block in the Claude Desktop config (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json`), with an absolute path to `dist/main.js`. Restart Claude Desktop.

## Local-only note

This server does not upload wiki content anywhere by itself. It reads Confluence over your network and returns results to whichever MCP client spawned it. If that client is connected to a hosted model, page bodies and titles in tool results can be sent to that model. Keep `CONFLUENCE_SPACES` tight.

## Tests

Synthetic fixtures only — a local mock of Confluence REST, not a live wiki:

```bash
npm test
```

One test records every HTTP method seen by the mock while exercising every tool and asserts that no non-GET request is ever made.
