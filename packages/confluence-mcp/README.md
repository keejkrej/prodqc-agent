# confluence-mcp

Read-only MCP server for a self-hosted **Confluence Server** REST API (`/rest/api/...`). It speaks MCP over stdio, issues **GET requests only**, and never creates, updates, or deletes wiki content.

This process runs on your machine. Page titles, storage/view bodies, labels, and downloaded attachments leave the laptop only if the MCP client you attach (Cursor, Claude Desktop, or another model host) sends them to a model.

## Tools

| Tool | What it does |
| --- | --- |
| `check_instance` | `GET /rest/api/space` and report whether REST works |
| `list_spaces` | Paginated spaces (`start` / `limit`) |
| `search` | CQL via `GET /rest/api/content/search` (never POST) |
| `get_page` | Storage and/or view body, labels, version, ancestors |
| `get_children` | Direct child pages |
| `get_page_tree` | Recursive children with a depth limit (default 3, max 8) |
| `get_page_links` | Parse `ac:link` / `ri:page` / `ri:attachment` in `body.storage` into resolved outgoing edges |
| `get_attachments` | Attachment metadata; optional download to a local folder |
| `get_history` | Versions with author and date |
| `build_space_graph` | Nodes = pages, edges = parent + storage links, JSON written to a local file |

`CONFLUENCE_SPACES` (comma-separated keys) is an allowlist enforced on every call: explicit CQL `space=` / `space in (...)` values outside the list are rejected, other CQL is AND-ed with the list, and page fetches whose space is not listed return 403.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONFLUENCE_BASE_URL` | yes | Origin of Confluence Server, e.g. `https://confluence.lab.local` |
| `CONFLUENCE_PAT` | one of | Personal access token (sent as `Authorization: Bearer`) |
| `CONFLUENCE_USER` + `CONFLUENCE_PASSWORD` | one of | Basic auth (do not set these together with `CONFLUENCE_PAT`) |
| `CONFLUENCE_SPACES` | no | Allowlist, e.g. `LAB,QC` |
| `CONFLUENCE_MIN_INTERVAL_MS` | no | Gap between GETs (default `150`) |
| `CONFLUENCE_TIMEOUT_MS` | no | Per-request timeout (default `30000`) |
| `CONFLUENCE_MAX_RETRIES` | no | Extra attempts on timeout / `429` (default `3`). `429` honors `Retry-After`, capped at 10s |

401 / 403 / 404 come back as explicit errors that mention credentials, the allowlist, or a missing page.

## Run it on a lab laptop

Node 20+ is required. From this package:

```bash
cd packages/confluence-mcp
npm install
npm test
npm run build
```

On filesystems that reject `npm install` in the working tree (some overlay mounts), use the cache helper and then build:

```bash
npm run deps:ext4
npm test
npm run build
```

Point it at your instance (PAT shown; basic auth is the same with user/password instead):

```bash
export CONFLUENCE_BASE_URL="https://confluence.lab.local"
export CONFLUENCE_PAT="your-personal-access-token"
export CONFLUENCE_SPACES="LAB,QC"
node dist/main.js
```

The process waits on stdin/stdout. That is the MCP transport — leave it in the foreground or let Cursor / Claude Desktop spawn it.

Confirm REST before attaching a model client:

```bash
# in another shell, or call the check_instance tool once the MCP client is connected
```

`check_instance` is the intended smoke test: it only calls `GET /rest/api/space`.

## Add it to Cursor

In Cursor MCP settings (`~/.cursor/mcp.json`, or the project `.cursor/mcp.json`), add a server that runs the compiled entrypoint with env vars on the laptop:

```json
{
  "mcpServers": {
    "confluence": {
      "command": "node",
      "args": ["/absolute/path/to/prodqc-agent/packages/confluence-mcp/dist/main.js"],
      "env": {
        "CONFLUENCE_BASE_URL": "https://confluence.lab.local",
        "CONFLUENCE_PAT": "<pat>",
        "CONFLUENCE_SPACES": "LAB,QC"
      }
    }
  }
}
```

Restart Cursor (or reload MCP servers) and call `check_instance`.

## Add it to Claude Desktop

Edit the Claude Desktop config (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json`) with the same `mcpServers.confluence` block as above, using an absolute path to `dist/main.js`. Restart Claude Desktop.

## Local-only note

This server does not upload wiki content anywhere by itself. It reads Confluence over your network and returns results to whichever MCP client spawned it. If that client is connected to a hosted model, page bodies and titles in tool results can be sent to that model. Keep `CONFLUENCE_SPACES` tight, prefer `get_page` over dumping a whole space, and do not paste secrets into page bodies you then fetch.

## Tests

Synthetic fixtures only — a local mock of Confluence Server, not a live wiki:

```bash
npm test
```

One test records every HTTP method seen by the mock while exercising all ten tools and asserts that no non-GET request is ever made.
