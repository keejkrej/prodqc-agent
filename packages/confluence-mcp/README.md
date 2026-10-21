# confluence-mcp

Small **GET-only** MCP server for a self-hosted Confluence Server REST API (`/rest/api/...`). It fills gaps in [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian) and offers a tiny read-only fallback for instances older than that project's Server/DC 6.0 floor.

This process runs on your machine. Page titles, bodies, and graph files leave the laptop only if the MCP client you attach (Cursor, Claude Desktop, or another model host) sends them to a model.

## Try mcp-atlassian first

For Confluence Server/Data Center **6.0+**, use mcp-atlassian in read-only mode. It already covers the usual browse path well:

| Need | mcp-atlassian |
| --- | --- |
| CQL search | `confluence_search` |
| Get page | `confluence_get_page` |
| Child pages | `confluence_get_page_children` |
| Space hierarchy | `confluence_get_space_page_tree` |
| Attachment metadata and download | `confluence_get_attachments`, `confluence_download_attachment` |
| One historical version's body | `confluence_get_page_history` |
| Read-only mode | `READ_ONLY_MODE=true` (hides create/update/delete tools) |
| Server/DC auth | PAT (`CONFLUENCE_PERSONAL_TOKEN`) or basic (`CONFLUENCE_USERNAME` + `CONFLUENCE_API_TOKEN` as the password) |

Example Cursor / Claude Desktop snippet:

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

Call this package's `check_instance` if you are unsure the REST API even answers. If mcp-atlassian can search and get a page, keep using it for those jobs.

## What this package adds

Use **this** server when you need something mcp-atlassian does not do, or when the instance is too old for mcp-atlassian:

| Tool | Why it exists here |
| --- | --- |
| `get_page_links` | Parse `ac:link` / `ri:page` / `ri:attachment` in `body.storage` into resolved outgoing edges |
| `build_space_graph` | Nodes = pages, edges = parent + storage links, JSON written to a local file |
| `get_history` | Version **list** with author and date (mcp-atlassian fetches one version's body, not the changelog) |
| `check_instance` | `GET /rest/api/space` and report whether REST works |
| `list_spaces` | Fallback for old instances |
| `search` | Fallback CQL (`GET` only; never POST) |
| `get_page` | Fallback page fetch (storage and/or view, labels, version, ancestors) |
| `get_children` | Fallback direct children |

There are no write endpoints and no attachment-download tool (mcp-atlassian already does that).

`CONFLUENCE_SPACES` (comma-separated keys) is an allowlist enforced on every call: explicit CQL `space=` / `space in (...)` values outside the list are rejected, other CQL is AND-ed with the list, and page fetches whose space is not listed return 403.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONFLUENCE_BASE_URL` | yes | Origin of Confluence Server, e.g. `https://confluence.example.com` |
| `CONFLUENCE_PAT` | one of | Personal access token (`Authorization: Bearer`) |
| `CONFLUENCE_USER` + `CONFLUENCE_PASSWORD` | one of | Basic auth (do not set these together with `CONFLUENCE_PAT`) |
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

You can run this beside mcp-atlassian: let mcp-atlassian do search/get/children/attachments, and this server do links, graph, version list, and `check_instance`.

## Add it to Claude Desktop

Same `mcpServers` block in the Claude Desktop config (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json`), with an absolute path to `dist/main.js`. Restart Claude Desktop.

## Local-only note

This server does not upload wiki content anywhere by itself. It reads Confluence over your network and returns results to whichever MCP client spawned it. If that client is connected to a hosted model, page bodies and titles in tool results can be sent to that model. Keep `CONFLUENCE_SPACES` tight, prefer `get_page` over dumping a whole space, and do not paste secrets into page bodies you then fetch.

## Tests

Synthetic fixtures only — a local mock of Confluence Server, not a live wiki:

```bash
npm test
```

One test records every HTTP method seen by the mock while exercising every tool and asserts that no non-GET request is ever made.
