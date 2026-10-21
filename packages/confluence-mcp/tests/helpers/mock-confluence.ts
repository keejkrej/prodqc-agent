import http from "node:http";
import {
  SYNTHETIC_ATTACHMENTS,
  SYNTHETIC_PAGES,
  SYNTHETIC_SPACES,
  VALID_PASSWORD,
  VALID_PAT,
  VALID_USER,
  type FixturePage,
} from "../fixtures/synthetic.js";

export interface MockRequest {
  method: string;
  url: string;
}

export interface MockConfluence {
  baseUrl: string;
  requests: MockRequest[];
  close: () => Promise<void>;
}

const BASIC = Buffer.from(`${VALID_USER}:${VALID_PASSWORD}`, "utf8").toString("base64");

export async function startMockConfluence(): Promise<MockConfluence> {
  const requests: MockRequest[] = [];

  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const url = req.url ?? "/";
    requests.push({ method, url });

    if (method !== "GET") {
      json(res, 405, { message: `Write method ${method} is not served by this mock` });
      return;
    }

    if (!authorized(req.headers.authorization)) {
      json(res, 401, { message: "Anonymous access not allowed" });
      return;
    }

    const parsed = new URL(url, "http://127.0.0.1");
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    const start = intParam(parsed, "start", 0);
    const limit = intParam(parsed, "limit", 25);
    const expand = parsed.searchParams.get("expand") ?? "";

    if (pathname === "/rest/api/space") {
      json(res, 200, paginate(SYNTHETIC_SPACES, start, limit));
      return;
    }

    const spaceMatch = /^\/rest\/api\/space\/([^/]+)$/.exec(pathname);
    if (spaceMatch) {
      const space = SYNTHETIC_SPACES.find((item) => item.key === spaceMatch[1]);
      if (!space) {
        json(res, 404, { message: "No space with that key" });
        return;
      }
      json(res, 200, space);
      return;
    }

    if (pathname === "/rest/api/content/search") {
      const cql = parsed.searchParams.get("cql") ?? "";
      const hits = searchPages(cql).map((page) => serializePage(page, expand));
      json(res, 200, paginate(hits, start, limit, { totalSize: hits.length }));
      return;
    }

    const childPage = /^\/rest\/api\/content\/([^/]+)\/child\/page$/.exec(pathname);
    if (childPage) {
      const parent = findPage(childPage[1] ?? "");
      if (!parent) {
        json(res, 404, { message: "No content with that id" });
        return;
      }
      const kids = SYNTHETIC_PAGES.filter((page) => page.parentId === parent.id).map((page) =>
        serializePage(page, expand),
      );
      json(res, 200, paginate(kids, start, limit));
      return;
    }

    const childAtt = /^\/rest\/api\/content\/([^/]+)\/child\/attachment$/.exec(pathname);
    if (childAtt) {
      const parent = findPage(childAtt[1] ?? "");
      if (!parent) {
        json(res, 404, { message: "No content with that id" });
        return;
      }
      const atts = SYNTHETIC_ATTACHMENTS.filter((item) => item.pageId === parent.id).map((item) => ({
        id: item.id,
        type: "attachment",
        title: item.title,
        extensions: { mediaType: item.mediaType, fileSize: item.fileSize },
        _links: { download: `/download/attachments/${item.pageId}/${item.title}` },
      }));
      json(res, 200, paginate(atts, start, limit));
      return;
    }

    const versions = /^\/rest\/api\/content\/([^/]+)\/version$/.exec(pathname);
    if (versions) {
      const page = findPage(versions[1] ?? "");
      if (!page) {
        json(res, 404, { message: "No content with that id" });
        return;
      }
      json(res, 200, paginate([...page.versions].reverse(), start, limit));
      return;
    }

    const history = /^\/rest\/api\/content\/([^/]+)\/history$/.exec(pathname);
    if (history) {
      const page = findPage(history[1] ?? "");
      if (!page) {
        json(res, 404, { message: "No content with that id" });
        return;
      }
      const latest = page.versions[page.versions.length - 1];
      json(res, 200, {
        lastUpdated: latest,
        createdBy: page.versions[0]?.by,
      });
      return;
    }

    const content = /^\/rest\/api\/content\/([^/]+)$/.exec(pathname);
    if (content) {
      const id = content[1] ?? "";
      if (id === "4030") {
        json(res, 403, { message: "Not permitted to view content" });
        return;
      }
      const page = findPage(id);
      if (!page) {
        json(res, 404, { message: "No content with that id" });
        return;
      }
      json(res, 200, serializePage(page, expand));
      return;
    }

    const download = /^\/download\/attachments\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (download) {
      const att = SYNTHETIC_ATTACHMENTS.find(
        (item) => item.pageId === download[1] && item.title === download[2],
      );
      if (!att) {
        json(res, 404, { message: "Attachment not found" });
        return;
      }
      res.writeHead(200, { "content-type": att.mediaType });
      res.end(att.bytes);
      return;
    }

    json(res, 404, { message: `No REST resource at ${pathname}` });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function authorized(header: string | undefined): boolean {
  return header === `Bearer ${VALID_PAT}` || header === `Basic ${BASIC}`;
}

function findPage(id: string): FixturePage | undefined {
  return SYNTHETIC_PAGES.find((page) => page.id === id);
}

function serializePage(page: FixturePage, expand: string) {
  const space = SYNTHETIC_SPACES.find((item) => item.key === page.spaceKey);
  const latest = page.versions[page.versions.length - 1];
  const ancestors = ancestorChain(page).map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
  }));
  const body: Record<string, { value: string; representation: string }> = {};
  if (expand.includes("body.storage")) {
    body.storage = { value: page.storage, representation: "storage" };
  }
  if (expand.includes("body.view")) {
    body.view = { value: page.view, representation: "view" };
  }
  return {
    id: page.id,
    type: page.type,
    title: page.title,
    space,
    ...(expand.includes("version") ? { version: latest } : {}),
    ...(expand.includes("ancestors") ? { ancestors } : {}),
    ...(expand.includes("metadata.labels")
      ? { metadata: { labels: { results: page.labels.map((name) => ({ name })) } } }
      : {}),
    ...(Object.keys(body).length > 0 ? { body } : {}),
    _links: { webui: `/display/${page.spaceKey}/${encodeURIComponent(page.title)}` },
  };
}

function ancestorChain(page: FixturePage): FixturePage[] {
  const chain: FixturePage[] = [];
  let parentId = page.parentId;
  while (parentId) {
    const parent = findPage(parentId);
    if (!parent) break;
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

function searchPages(cql: string): FixturePage[] {
  let items = [...SYNTHETIC_PAGES];
  const typeMatch = /type\s*=\s*"?(\w+)"?/i.exec(cql);
  if (typeMatch?.[1]) {
    items = items.filter((page) => page.type === typeMatch[1]);
  }
  const spaces: string[] = [];
  for (const match of cql.matchAll(/space\s+in\s*\(([^)]+)\)/gi)) {
    for (const part of (match[1] ?? "").split(",")) {
      const key = part.trim().replace(/^["']|["']$/g, "");
      if (key) spaces.push(key);
    }
  }
  for (const match of cql.matchAll(/space\s*=\s*"?([A-Za-z0-9_]+)"?/gi)) {
    if (match[1]) spaces.push(match[1]);
  }
  if (spaces.length > 0) {
    items = items.filter((page) => spaces.includes(page.spaceKey));
  }
  const titleExact = /title\s*=\s*"([^"]+)"/i.exec(cql);
  if (titleExact?.[1]) {
    items = items.filter((page) => page.title === titleExact[1]);
  }
  const titleLike = /title\s*~\s*"([^"]+)"/i.exec(cql);
  if (titleLike?.[1]) {
    const needle = titleLike[1].toLowerCase();
    items = items.filter((page) => page.title.toLowerCase().includes(needle));
  }
  return items;
}

function paginate<T>(
  items: readonly T[],
  start: number,
  limit: number,
  extra: { totalSize?: number } = {},
) {
  const results = items.slice(start, start + limit);
  return {
    results,
    start,
    limit,
    size: results.length,
    ...(extra.totalSize !== undefined ? { totalSize: extra.totalSize } : {}),
  };
}

function intParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
