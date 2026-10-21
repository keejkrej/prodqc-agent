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
    "get_page_links",
    {
      description:
        "Parse ac:link / ri:page / ri:attachment from body.storage into resolved outgoing edges. Not provided by mcp-atlassian.",
      inputSchema: {
        id: z.string().min(1),
        resolve: z.boolean().optional(),
      },
    },
    jsonTool(handlers.get_page_links),
  );

  server.registerTool(
    "get_history",
    {
      description:
        "GET the version list for a page (number, author, date). mcp-atlassian's confluence_get_page_history fetches one version body, not this changelog.",
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
        "Walk a space's pages (GET only), emit parent and storage-link edges, and write JSON to a local file. Not provided by mcp-atlassian.",
      inputSchema: {
        spaceKey: z.string().min(1),
        outputPath: z.string().min(1),
        maxPages: z.number().int().min(1).max(500).optional(),
        includeLinks: z.boolean().optional(),
      },
    },
    jsonTool(handlers.build_space_graph),
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
