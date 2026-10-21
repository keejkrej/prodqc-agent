import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertSpaceAllowed, constrainCql, filterAllowed } from "./allowlist.js";
import type { ConfluenceClient } from "./client.js";
import { ConfluenceHttpError } from "./errors.js";
import { parseStorageLinks } from "./links.js";
import { asPaginated, asRecord, collectAll, type Paginated } from "./pagination.js";
import type {
  AttachmentSummary,
  BodyMode,
  InstanceCheck,
  OutgoingEdge,
  PageDetail,
  PageSummary,
  PageTreeNode,
  PageVersion,
  SpaceGraph,
  SpaceSummary,
} from "./types.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_TREE_DEPTH = 8;
const MAX_GRAPH_PAGES = 500;

export function createHandlers(client: ConfluenceClient) {
  return {
    list_spaces: (args: { start?: number | undefined; limit?: number | undefined }) =>
      listSpaces(client, args),
    search: (args: {
      cql: string;
      start?: number | undefined;
      limit?: number | undefined;
      expand?: string | undefined;
    }) => search(client, args),
    get_page: (args: { id: string; body?: BodyMode | undefined }) => getPage(client, args),
    get_children: (args: {
      id: string;
      start?: number | undefined;
      limit?: number | undefined;
    }) => getChildren(client, args),
    get_page_tree: (args: { id: string; maxDepth?: number | undefined }) => getPageTree(client, args),
    get_page_links: (args: { id: string; resolve?: boolean | undefined }) =>
      getPageLinks(client, args),
    get_attachments: (args: {
      id: string;
      start?: number | undefined;
      limit?: number | undefined;
      downloadDir?: string | undefined;
    }) => getAttachments(client, args),
    get_history: (args: { id: string; start?: number | undefined; limit?: number | undefined }) =>
      getHistory(client, args),
    build_space_graph: (args: {
      spaceKey: string;
      outputPath: string;
      maxPages?: number | undefined;
      includeLinks?: boolean | undefined;
    }) => buildSpaceGraph(client, args),
    check_instance: () => checkInstance(client),
  };
}

export async function listSpaces(
  client: ConfluenceClient,
  args: { start?: number | undefined; limit?: number | undefined },
): Promise<Paginated<SpaceSummary>> {
  const start = args.start ?? 0;
  const limit = clampLimit(args.limit);
  const allowed = client.config.allowedSpaces;

  if (allowed && allowed.length > 0) {
    const collected: SpaceSummary[] = [];
    let cursor = 0;
    const pageSize = 25;
    while (collected.length < start + limit) {
      const page = asPaginated<unknown>(
        await client.getJson("/rest/api/space", { start: cursor, limit: pageSize }),
        cursor,
        pageSize,
      );
      collected.push(
        ...filterAllowed(page.results.map(toSpaceSummary), (space) => space.key, allowed),
      );
      if (page.results.length < pageSize) break;
      cursor += pageSize;
    }
    const sliced = collected.slice(start, start + limit);
    return {
      results: sliced,
      start,
      limit,
      size: sliced.length,
      totalSize: collected.length,
    };
  }

  const page = asPaginated<unknown>(
    await client.getJson("/rest/api/space", { start, limit }),
    start,
    limit,
  );
  const results = page.results.map(toSpaceSummary);
  return { ...page, results };
}

export async function search(
  client: ConfluenceClient,
  args: {
    cql: string;
    start?: number | undefined;
    limit?: number | undefined;
    expand?: string | undefined;
  },
): Promise<Paginated<PageSummary> & { cql: string }> {
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
  return { ...page, results, size: results.length, cql };
}

export async function getPage(
  client: ConfluenceClient,
  args: { id: string; body?: BodyMode | undefined },
): Promise<PageDetail> {
  const body = args.body ?? "both";
  const expand = ["version", "ancestors", "space", "metadata.labels"];
  if (body === "storage" || body === "both") expand.push("body.storage");
  if (body === "view" || body === "both") expand.push("body.view");
  const raw = asRecord(await client.getJson(`/rest/api/content/${encodeURIComponent(args.id)}`, {
    expand: expand.join(","),
  }));
  const page = toPageDetail(raw);
  assertSpaceAllowed(page.spaceKey, client.config.allowedSpaces);
  return page;
}

export async function getChildren(
  client: ConfluenceClient,
  args: { id: string; start?: number | undefined; limit?: number | undefined },
): Promise<Paginated<PageSummary>> {
  await assertPageInAllowlist(client, args.id);
  const start = args.start ?? 0;
  const limit = clampLimit(args.limit);
  const page = asPaginated<unknown>(
    await client.getJson(`/rest/api/content/${encodeURIComponent(args.id)}/child/page`, {
      start,
      limit,
      expand: "space,version",
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

export async function getPageTree(
  client: ConfluenceClient,
  args: { id: string; maxDepth?: number | undefined },
): Promise<PageTreeNode> {
  const maxDepth = Math.min(Math.max(args.maxDepth ?? 3, 0), MAX_TREE_DEPTH);
  const root = await getPage(client, { id: args.id, body: "none" });
  return walkTree(client, root, 0, maxDepth);
}

async function walkTree(
  client: ConfluenceClient,
  page: Pick<PageDetail, "id" | "title" | "spaceKey">,
  depth: number,
  maxDepth: number,
): Promise<PageTreeNode> {
  if (depth >= maxDepth) {
    return { id: page.id, title: page.title, spaceKey: page.spaceKey, children: [] };
  }
  const children: PageTreeNode[] = [];
  const kids = await collectAll(
    (start, limit) => getChildren(client, { id: page.id, start, limit }),
    { pageSize: 25, maxItems: 200 },
  );
  for (const kid of kids) {
    children.push(await walkTree(client, kid, depth + 1, maxDepth));
  }
  return { id: page.id, title: page.title, spaceKey: page.spaceKey, children };
}

export async function getPageLinks(
  client: ConfluenceClient,
  args: { id: string; resolve?: boolean | undefined },
): Promise<{ id: string; title: string; spaceKey: string; edges: OutgoingEdge[] }> {
  const resolve = args.resolve ?? true;
  const page = await getPage(client, { id: args.id, body: "storage" });
  const parsed = parseStorageLinks(page.body.storage ?? "");
  const attachments = parsed.some((link) => link.kind === "attachment")
    ? (await collectAll(
        (start, limit) =>
          getAttachments(client, { id: page.id, start, limit }),
        { pageSize: 25, maxItems: 100 },
      ))
    : [];

  const edges: OutgoingEdge[] = [];
  for (const link of parsed) {
    if (link.kind === "page") {
      const spaceKey = link.spaceKey ?? page.spaceKey;
      let toId: string | null = null;
      if (resolve) {
        const found = await search(client, {
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

export async function getAttachments(
  client: ConfluenceClient,
  args: {
    id: string;
    start?: number | undefined;
    limit?: number | undefined;
    downloadDir?: string | undefined;
  },
): Promise<Paginated<AttachmentSummary>> {
  await assertPageInAllowlist(client, args.id);
  const start = args.start ?? 0;
  const limit = clampLimit(args.limit);
  const page = asPaginated<unknown>(
    await client.getJson(`/rest/api/content/${encodeURIComponent(args.id)}/child/attachment`, {
      start,
      limit,
    }),
    start,
    limit,
  );
  const results: AttachmentSummary[] = [];
  for (const raw of page.results) {
    let item = toAttachmentSummary(raw);
    if (args.downloadDir && item.downloadPath) {
      const bytes = await client.getBytes(item.downloadPath);
      const destDir = path.resolve(args.downloadDir);
      await mkdir(destDir, { recursive: true });
      const dest = path.join(destDir, safeFilename(item.title));
      await writeFile(dest, bytes);
      item = { ...item, downloadedTo: dest };
    }
    results.push(item);
  }
  return { ...page, results, size: results.length };
}

export async function getHistory(
  client: ConfluenceClient,
  args: { id: string; start?: number | undefined; limit?: number | undefined },
): Promise<{ id: string; versions: PageVersion[] } & Paginated<PageVersion>> {
  await assertPageInAllowlist(client, args.id);
  const start = args.start ?? 0;
  const limit = clampLimit(args.limit);
  try {
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
  } catch (error) {
    if (!(error instanceof ConfluenceHttpError) || error.status !== 404) throw error;
    const history = asRecord(
      await client.getJson(`/rest/api/content/${encodeURIComponent(args.id)}/history`),
    );
    const lastUpdated = asRecord(history.lastUpdated);
    const createdBy = asRecord(history.createdBy);
    const versions: PageVersion[] = [
      {
        number: typeof lastUpdated.number === "number" ? lastUpdated.number : 1,
        when: typeof lastUpdated.when === "string" ? lastUpdated.when : null,
        author: displayNameOf(lastUpdated.by) ?? displayNameOf(createdBy),
        username: usernameOf(lastUpdated.by) ?? usernameOf(createdBy),
        message: typeof lastUpdated.message === "string" ? lastUpdated.message : null,
      },
    ];
    return {
      id: args.id,
      results: versions,
      versions,
      start: 0,
      limit,
      size: versions.length,
    };
  }
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
      search(client, {
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
    const detail = await getPage(client, { id: page.id, body: includeLinks ? "storage" : "none" });
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

export async function checkInstance(client: ConfluenceClient): Promise<InstanceCheck> {
  const restApi = "/rest/api/space";
  try {
    const page = asPaginated<unknown>(
      await client.getJson(restApi, { limit: 5 }),
      0,
      5,
    );
    const spaces = filterAllowed(
      page.results.map(toSpaceSummary),
      (space) => space.key,
      client.config.allowedSpaces,
    );
    return {
      ok: true,
      baseUrl: client.config.baseUrl,
      restApi,
      auth: client.config.auth.kind,
      allowlist: client.config.allowedSpaces ? [...client.config.allowedSpaces] : null,
      message: "Confluence Server REST API responded to GET /rest/api/space",
      sampleSpaceKeys: spaces.map((space) => space.key),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      baseUrl: client.config.baseUrl,
      restApi,
      auth: client.config.auth.kind,
      allowlist: client.config.allowedSpaces ? [...client.config.allowedSpaces] : null,
      message,
      sampleSpaceKeys: [],
    };
  }
}

async function assertPageInAllowlist(client: ConfluenceClient, id: string): Promise<void> {
  if (!client.config.allowedSpaces || client.config.allowedSpaces.length === 0) return;
  await getPage(client, { id, body: "none" });
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
}

function escapeCql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^A-Za-z0-9._-]+/g, "_");
  return base.length > 0 ? base : "attachment.bin";
}

function toSpaceSummary(raw: unknown): SpaceSummary {
  const record = asRecord(raw);
  return {
    id: String(record.id ?? ""),
    key: String(record.key ?? ""),
    name: String(record.name ?? ""),
    type: String(record.type ?? "global"),
  };
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
  const version = raw.version ? toPageVersion(raw.version) : null;
  const ancestorsRaw = Array.isArray(raw.ancestors) ? raw.ancestors : [];
  const metadata = asRecord(raw.metadata);
  const labelsContainer = asRecord(metadata.labels);
  const labels = Array.isArray(labelsContainer.results)
    ? labelsContainer.results
        .map((item) => {
          const rec = asRecord(item);
          return typeof rec.name === "string" ? rec.name : "";
        })
        .filter((name) => name.length > 0)
    : [];
  const body = asRecord(raw.body);
  const storage = asRecord(body.storage);
  const view = asRecord(body.view);
  const links = asRecord(raw._links);
  const bodyOut: PageDetail["body"] = {
    ...(typeof storage.value === "string" ? { storage: storage.value } : {}),
    ...(typeof view.value === "string" ? { view: view.value } : {}),
  };
  return {
    id: String(raw.id ?? ""),
    type: String(raw.type ?? "page"),
    title: String(raw.title ?? ""),
    spaceKey: String(space.key ?? ""),
    spaceName: typeof space.name === "string" ? space.name : null,
    version,
    ancestors: ancestorsRaw.map((item) => {
      const rec = asRecord(item);
      return { id: String(rec.id ?? ""), title: String(rec.title ?? "") };
    }),
    labels,
    body: bodyOut,
    webui: typeof links.webui === "string" ? links.webui : null,
  };
}

function toPageVersion(raw: unknown): PageVersion {
  const record = asRecord(raw);
  const by = record.by !== undefined ? record.by : record.author;
  return {
    number: typeof record.number === "number" ? record.number : 0,
    when: typeof record.when === "string" ? record.when : null,
    author: displayNameOf(by),
    username: usernameOf(by),
    message: typeof record.message === "string" ? record.message : null,
  };
}

function toAttachmentSummary(raw: unknown): AttachmentSummary {
  const record = asRecord(raw);
  const extensions = asRecord(record.extensions);
  const links = asRecord(record._links);
  return {
    id: String(record.id ?? ""),
    title: String(record.title ?? ""),
    mediaType: typeof extensions.mediaType === "string" ? extensions.mediaType : null,
    fileSize: typeof extensions.fileSize === "number" ? extensions.fileSize : null,
    downloadPath: typeof links.download === "string" ? links.download : null,
  };
}

function displayNameOf(value: unknown): string | null {
  const record = asRecord(value);
  if (typeof record.displayName === "string") return record.displayName;
  if (typeof record.username === "string") return record.username;
  return null;
}

function usernameOf(value: unknown): string | null {
  const record = asRecord(value);
  return typeof record.username === "string" ? record.username : null;
}
