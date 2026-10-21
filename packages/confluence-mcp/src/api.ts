import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSpaceAllowed, constrainCql, filterAllowed } from "./allowlist.js";
import type { ConfluenceClient } from "./client.js";
import { parseStorageLinks } from "./links.js";
import { asPaginated, asRecord, collectAll, type Paginated } from "./pagination.js";
import type {
  AttachmentSummary,
  OutgoingEdge,
  PageDetail,
  PageSummary,
  PageVersion,
  SpaceGraph,
} from "./types.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_GRAPH_PAGES = 500;

export function createHandlers(client: ConfluenceClient) {
  return {
    get_page_links: (args: { id: string; resolve?: boolean | undefined }) =>
      getPageLinks(client, args),
    get_history: (args: { id: string; start?: number | undefined; limit?: number | undefined }) =>
      getHistory(client, args),
    build_space_graph: (args: {
      spaceKey: string;
      outputPath: string;
      maxPages?: number | undefined;
      includeLinks?: boolean | undefined;
    }) => buildSpaceGraph(client, args),
  };
}

export async function getPageLinks(
  client: ConfluenceClient,
  args: { id: string; resolve?: boolean | undefined },
): Promise<{ id: string; title: string; spaceKey: string; edges: OutgoingEdge[] }> {
  const resolve = args.resolve ?? true;
  const page = await getPage(client, args.id, true);
  const parsed = parseStorageLinks(page.body.storage ?? "");
  const attachments = parsed.some((link) => link.kind === "attachment")
    ? await collectAll(
        (start, limit) => listAttachments(client, page.id, start, limit),
        { pageSize: 25, maxItems: 100 },
      )
    : [];

  const edges: OutgoingEdge[] = [];
  for (const link of parsed) {
    if (link.kind === "page") {
      const spaceKey = link.spaceKey ?? page.spaceKey;
      let toId: string | null = null;
      if (resolve) {
        const found = await searchPages(client, {
          cql: `type=page AND title="${escapeCql(link.title)}" AND space="${escapeCql(spaceKey)}"`,
          limit: 5,
        });
        toId = found.results[0]?.id ?? null;
      }
      edges.push({ kind: "page", fromId: page.id, title: link.title, spaceKey, toId });
    } else {
      const match = attachments.find((item) => item.title === link.filename);
      edges.push({
        kind: "attachment",
        fromId: page.id,
        filename: link.filename,
        toId: match?.id ?? null,
      });
    }
  }
  return { id: page.id, title: page.title, spaceKey: page.spaceKey, edges };
}

export async function getHistory(
  client: ConfluenceClient,
  args: { id: string; start?: number | undefined; limit?: number | undefined },
): Promise<{ id: string; versions: PageVersion[] } & Paginated<PageVersion>> {
  await assertPageInAllowlist(client, args.id);
  const start = args.start ?? 0;
  const limit = clampLimit(args.limit);
  const page = asPaginated<unknown>(
    await client.getJson(`/rest/api/content/${encodeURIComponent(args.id)}/version`, {
      start,
      limit,
    }),
    start,
    limit,
  );
  const versions = page.results.map(toPageVersion);
  return { id: args.id, ...page, results: versions, versions, size: versions.length };
}

export async function buildSpaceGraph(
  client: ConfluenceClient,
  args: {
    spaceKey: string;
    outputPath: string;
    maxPages?: number | undefined;
    includeLinks?: boolean | undefined;
  },
): Promise<{ outputPath: string; graph: SpaceGraph }> {
  assertSpaceAllowed(args.spaceKey, client.config.allowedSpaces);
  const maxPages = Math.min(Math.max(args.maxPages ?? 200, 1), MAX_GRAPH_PAGES);
  const includeLinks = args.includeLinks ?? true;
  const pages = await collectAll(
    (start, limit) =>
      searchPages(client, {
        cql: `type=page AND space="${escapeCql(args.spaceKey)}"`,
        start,
        limit,
        expand: "ancestors,space",
      }),
    { pageSize: 25, maxItems: maxPages },
  );
  const truncated = pages.length >= maxPages;

  const nodes = pages.map((page) => ({
    id: page.id,
    title: page.title,
    type: page.type,
    spaceKey: page.spaceKey,
  }));

  const edges: SpaceGraph["edges"][number][] = [];
  const seenEdge = new Set<string>();
  const addEdge = (type: "parent" | "link", from: string, to: string, label?: string) => {
    const key = `${type}:${from}:${to}`;
    if (seenEdge.has(key) || from === to) return;
    seenEdge.add(key);
    edges.push(label ? { type, from, to, label } : { type, from, to });
  };

  for (const page of pages) {
    const detail = await getPage(client, page.id, includeLinks);
    const parent = detail.ancestors[detail.ancestors.length - 1];
    if (parent) addEdge("parent", parent.id, page.id);
    if (includeLinks) {
      const parsed = parseStorageLinks(detail.body.storage ?? "");
      for (const link of parsed) {
        if (link.kind !== "page") continue;
        const spaceKey = link.spaceKey ?? detail.spaceKey;
        const target = pages.find(
          (candidate) => candidate.title === link.title && candidate.spaceKey === spaceKey,
        );
        if (target) addEdge("link", page.id, target.id, link.title);
      }
    }
  }

  const graph: SpaceGraph = {
    spaceKey: args.spaceKey,
    generatedAt: new Date().toISOString(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    truncated,
    nodes,
    edges,
  };
  const outputPath = path.resolve(args.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  return { outputPath, graph };
}

async function searchPages(
  client: ConfluenceClient,
  args: {
    cql: string;
    start?: number | undefined;
    limit?: number | undefined;
    expand?: string | undefined;
  },
): Promise<Paginated<PageSummary>> {
  const start = args.start ?? 0;
  const limit = clampLimit(args.limit);
  const cql = constrainCql(args.cql, client.config.allowedSpaces);
  const page = asPaginated<unknown>(
    await client.getJson("/rest/api/content/search", {
      cql,
      start,
      limit,
      ...(args.expand ? { expand: args.expand } : {}),
    }),
    start,
    limit,
  );
  const results = filterAllowed(
    page.results.map(toPageSummary),
    (item) => item.spaceKey,
    client.config.allowedSpaces,
  );
  return { ...page, results, size: results.length };
}

async function getPage(
  client: ConfluenceClient,
  id: string,
  includeStorage: boolean,
): Promise<PageDetail> {
  const expand = ["ancestors", "space"];
  if (includeStorage) expand.push("body.storage");
  const raw = asRecord(
    await client.getJson(`/rest/api/content/${encodeURIComponent(id)}`, {
      expand: expand.join(","),
    }),
  );
  const page = toPageDetail(raw);
  assertSpaceAllowed(page.spaceKey, client.config.allowedSpaces);
  return page;
}

async function listAttachments(
  client: ConfluenceClient,
  id: string,
  start: number,
  limit: number,
): Promise<Paginated<AttachmentSummary>> {
  await assertPageInAllowlist(client, id);
  const page = asPaginated<unknown>(
    await client.getJson(`/rest/api/content/${encodeURIComponent(id)}/child/attachment`, {
      start,
      limit,
    }),
    start,
    limit,
  );
  const results = page.results.map((raw) => {
    const record = asRecord(raw);
    return { id: String(record.id ?? ""), title: String(record.title ?? "") };
  });
  return { ...page, results, size: results.length };
}

async function assertPageInAllowlist(client: ConfluenceClient, id: string): Promise<void> {
  if (!client.config.allowedSpaces || client.config.allowedSpaces.length === 0) return;
  await getPage(client, id, false);
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
}

function escapeCql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toPageSummary(raw: unknown): PageSummary {
  const record = asRecord(raw);
  const space = asRecord(record.space);
  return {
    id: String(record.id ?? ""),
    type: String(record.type ?? "page"),
    title: String(record.title ?? ""),
    spaceKey: String(space.key ?? ""),
  };
}

function toPageDetail(raw: Record<string, unknown>): PageDetail {
  const space = asRecord(raw.space);
  const ancestorsRaw = Array.isArray(raw.ancestors) ? raw.ancestors : [];
  const body = asRecord(raw.body);
  const storage = asRecord(body.storage);
  return {
    id: String(raw.id ?? ""),
    type: String(raw.type ?? "page"),
    title: String(raw.title ?? ""),
    spaceKey: String(space.key ?? ""),
    ancestors: ancestorsRaw.map((item) => {
      const rec = asRecord(item);
      return { id: String(rec.id ?? ""), title: String(rec.title ?? "") };
    }),
    body: typeof storage.value === "string" ? { storage: storage.value } : {},
  };
}

function toPageVersion(raw: unknown): PageVersion {
  const record = asRecord(raw);
  const by = record.by !== undefined ? record.by : record.author;
  const byRecord = asRecord(by);
  return {
    number: typeof record.number === "number" ? record.number : 0,
    when: typeof record.when === "string" ? record.when : null,
    author: typeof byRecord.displayName === "string"
      ? byRecord.displayName
      : typeof byRecord.username === "string"
        ? byRecord.username
        : null,
    username: typeof byRecord.username === "string" ? byRecord.username : null,
    message: typeof record.message === "string" ? record.message : null,
  };
}
