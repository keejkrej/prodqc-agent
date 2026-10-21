import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createHandlers } from "./api.js";
import type { ConfluenceClient } from "./client.js";

export const SERVER_NAME = "confluence-mcp";
export const SERVER_VERSION = "0.1.0";

const optionalStart = z.number().int().min(0).optional();
const optionalLimit = z.number().int().min(1).max(100).optional();

export function createServer(client: ConfluenceClient): McpServer {
  const handlers = createHandlers(client);
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  server.registerTool(
    "list_spaces",
    {
      description:
        "List Confluence spaces visible to this account (GET /rest/api/space). Honors CONFLUENCE_SPACES.",
      inputSchema: {
        start: optionalStart,
        limit: optionalLimit,
      },
    },
    jsonTool(handlers.list_spaces),
  );

  server.registerTool(
    "search",
    {
      description:
        "Search with Confluence Query Language via GET /rest/api/content/search. Paginated with start/limit. Never uses POST.",
      inputSchema: {
        cql: z.string().min(1),
        start: optionalStart,
        limit: optionalLimit,
        expand: z.string().optional(),
      },
    },
    jsonTool(handlers.search),
  );

  server.registerTool(
    "get_page",
    {
      description:
        "GET a page by id, including storage and/or view body, labels, version, and ancestors.",
      inputSchema: {
        id: z.string().min(1),
        body: z.enum(["storage", "view", "both", "none"]).optional(),
      },
    },
    jsonTool(handlers.get_page),
  );

  server.registerTool(
    "get_children",
    {
      description: "GET direct child pages of a page (paginated).",
      inputSchema: {
        id: z.string().min(1),
        start: optionalStart,
        limit: optionalLimit,
      },
    },
    jsonTool(handlers.get_children),
  );

  server.registerTool(
    "get_page_tree",
    {
      description:
        "Recursively GET the child-page tree under a page. maxDepth is descendant depth (default 3, max 8).",
      inputSchema: {
        id: z.string().min(1),
        maxDepth: z.number().int().min(0).max(8).optional(),
      },
    },
    jsonTool(handlers.get_page_tree),
  );

  server.registerTool(
    "get_page_links",
    {
      description:
        "Parse ac:link / ri:page / ri:attachment from body.storage and resolve outgoing edges.",
      inputSchema: {
        id: z.string().min(1),
        resolve: z.boolean().optional(),
      },
    },
    jsonTool(handlers.get_page_links),
  );

  server.registerTool(
    "get_attachments",
    {
      description:
        "GET attachment metadata for a page. Optionally download bytes to a local folder (still GET).",
      inputSchema: {
        id: z.string().min(1),
        start: optionalStart,
        limit: optionalLimit,
        downloadDir: z.string().min(1).optional(),
      },
    },
    jsonTool(handlers.get_attachments),
  );

  server.registerTool(
    "get_history",
    {
      description: "GET page versions with author and date (paginated).",
      inputSchema: {
        id: z.string().min(1),
        start: optionalStart,
        limit: optionalLimit,
      },
    },
    jsonTool(handlers.get_history),
  );

  server.registerTool(
    "build_space_graph",
    {
      description:
        "Walk a space's pages (GET only), emit parent and storage-link edges, and write JSON to a local file.",
      inputSchema: {
        spaceKey: z.string().min(1),
        outputPath: z.string().min(1),
        maxPages: z.number().int().min(1).max(500).optional(),
        includeLinks: z.boolean().optional(),
      },
    },
    jsonTool(handlers.build_space_graph),
  );

  server.registerTool(
    "check_instance",
    {
      description:
        "GET /rest/api/space and report whether this Confluence Server REST API is reachable.",
      inputSchema: {},
    },
    jsonTool(async () => handlers.check_instance()),
  );

  return server;
}

function jsonTool<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A, _extra?: unknown) => {
    try {
      const data = await fn(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: message }],
        isError: true,
      };
    }
  };
}
