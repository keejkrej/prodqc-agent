import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { createHandlers } from "../src/api.js";
import { ConfluenceClient } from "../src/client.js";
import type { Config } from "../src/config.js";
import { ConfluenceHttpError } from "../src/errors.js";
import { VALID_PAT } from "./fixtures/synthetic.js";
import { startMockConfluence, type MockConfluence } from "./helpers/mock-confluence.js";

function testConfig(baseUrl: string, allowedSpaces?: readonly string[]): Config {
  return {
    baseUrl,
    auth: { kind: "pat", token: VALID_PAT },
    allowedSpaces,
    minIntervalMs: 0,
    timeoutMs: 5_000,
    maxRetries: 2,
  };
}

describe("ConfluenceClient against a mocked Server REST API", () => {
  let mock: MockConfluence;
  let client: ConfluenceClient;
  let handlers: ReturnType<typeof createHandlers>;

  before(async () => {
    mock = await startMockConfluence();
    client = new ConfluenceClient(testConfig(mock.baseUrl));
    handlers = createHandlers(client);
  });

  after(async () => {
    await mock.close();
  });

  it("lists spaces with start/limit pagination", async () => {
    const page = await handlers.list_spaces({ start: 0, limit: 2 });
    assert.equal(page.results.length, 2);
    assert.equal(page.results[0]?.key, "LAB");
    const rest = await handlers.list_spaces({ start: 2, limit: 2 });
    assert.equal(rest.results.length, 1);
    assert.equal(rest.results[0]?.key, "SECRET");
  });

  it("searches with CQL", async () => {
    const found = await handlers.search({ cql: 'type=page AND space=LAB AND title~"Size"' });
    assert.equal(found.results.length, 1);
    assert.equal(found.results[0]?.title, "Size Measurement");
  });

  it("gets storage and view body, labels, version, ancestors", async () => {
    const page = await handlers.get_page({ id: "1003", body: "both" });
    assert.equal(page.title, "Size Measurement");
    assert.equal(page.spaceKey, "LAB");
    assert.deepEqual(page.labels, ["synthetic"]);
    assert.equal(page.version?.number, 1);
    assert.equal(page.ancestors.at(-1)?.id, "1002");
    assert.match(page.body.storage ?? "", /SYNTHETIC size measurement/);
    assert.match(page.body.view ?? "", /SYNTHETIC size measurement/);
  });

  it("lists direct child pages", async () => {
    const children = await handlers.get_children({ id: "1001" });
    assert.equal(children.results.length, 2);
    assert.ok(children.results.some((page) => page.id === "1002"));
    assert.ok(children.results.some((page) => page.id === "1004"));
  });

  it("parses storage links into resolved outgoing edges", async () => {
    const links = await handlers.get_page_links({ id: "1002" });
    const pageEdges = links.edges.filter((edge) => edge.kind === "page");
    const attEdges = links.edges.filter((edge) => edge.kind === "attachment");
    assert.equal(pageEdges.length, 2);
    assert.equal(pageEdges.find((edge) => edge.title === "Size Measurement")?.toId, "1003");
    assert.equal(pageEdges.find((edge) => edge.title === "Buffer Prep")?.toId, "1004");
    assert.equal(attEdges[0]?.toId, "9001");
  });

  it("returns version history with author and date", async () => {
    const history = await handlers.get_history({ id: "1002" });
    assert.equal(history.versions.length, 3);
    assert.equal(history.versions[0]?.number, 3);
    assert.equal(history.versions[0]?.author, "Synthetic Author");
    assert.ok(history.versions[0]?.when);
  });

  it("writes a space graph JSON file with parent and link edges", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "confluence-graph-"));
    const outputPath = path.join(dir, "lab-graph.json");
    const { graph } = await handlers.build_space_graph({
      spaceKey: "LAB",
      outputPath,
    });
    assert.ok(graph.nodes.length >= 4);
    assert.ok(graph.edges.some((edge) => edge.type === "parent" && edge.from === "1001" && edge.to === "1002"));
    assert.ok(graph.edges.some((edge) => edge.type === "link" && edge.from === "1002" && edge.to === "1003"));
    const written = JSON.parse(await readFile(outputPath, "utf8")) as { spaceKey: string };
    assert.equal(written.spaceKey, "LAB");
  });

  it("check_instance GETs /rest/api/space and reports REST works", async () => {
    const check = await handlers.check_instance();
    assert.equal(check.ok, true);
    assert.equal(check.restApi, "/rest/api/space");
    assert.ok(check.sampleSpaceKeys.includes("LAB"));
  });

  it("gives clear errors for 401, 403, and 404", async () => {
    const unauth = new ConfluenceClient({
      ...testConfig(mock.baseUrl),
      auth: { kind: "pat", token: "wrong" },
    });
    await assert.rejects(
      () => createHandlers(unauth).list_spaces({}),
      (error: unknown) => {
        assert.ok(error instanceof ConfluenceHttpError);
        assert.equal(error.status, 401);
        assert.match(error.message, /401 Unauthorized/);
        assert.match(error.message, /CONFLUENCE_PAT/);
        return true;
      },
    );

    await assert.rejects(
      () => handlers.get_page({ id: "4030" }),
      (error: unknown) => {
        assert.ok(error instanceof ConfluenceHttpError);
        assert.equal(error.status, 403);
        assert.match(error.message, /403 Forbidden/);
        return true;
      },
    );

    await assert.rejects(
      () => handlers.get_page({ id: "9999" }),
      (error: unknown) => {
        assert.ok(error instanceof ConfluenceHttpError);
        assert.equal(error.status, 404);
        assert.match(error.message, /404 Not Found/);
        return true;
      },
    );
  });

  it("enforces CONFLUENCE_SPACES on every call", async () => {
    const limited = new ConfluenceClient(testConfig(mock.baseUrl, ["LAB"]));
    const limitedHandlers = createHandlers(limited);
    const spaces = await limitedHandlers.list_spaces({});
    assert.deepEqual(spaces.results.map((space) => space.key), ["LAB"]);

    await assert.rejects(
      () => limitedHandlers.get_page({ id: "2001" }),
      (error: unknown) => {
        assert.ok(error instanceof ConfluenceHttpError);
        assert.equal(error.status, 403);
        assert.match(error.message, /CONFLUENCE_SPACES/);
        return true;
      },
    );

    await assert.rejects(
      () => limitedHandlers.search({ cql: "type=page AND space=SECRET" }),
      (error: unknown) => {
        assert.ok(error instanceof ConfluenceHttpError);
        assert.equal(error.status, 403);
        return true;
      },
    );

    const constrained = await limitedHandlers.search({ cql: "type=page" });
    assert.ok(constrained.cql.includes('space in ("LAB")'));
    assert.ok(constrained.results.every((item) => item.spaceKey === "LAB"));
  });
});

describe("rate-limit 429 retry", () => {
  it("retries a GET after Retry-After", async () => {
    let calls = 0;
    const fetchFn: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("slow down", { status: 429, headers: { "Retry-After": "0" } });
      }
      return new Response(JSON.stringify({ results: [], start: 0, limit: 25, size: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = new ConfluenceClient(
      testConfig("https://confluence.example.com"),
      fetchFn,
    );
    const payload = await client.getJson("/rest/api/space");
    assert.deepEqual(payload, { results: [], start: 0, limit: 25, size: 0 });
    assert.equal(calls, 2);
    assert.ok(client.requests.every((request) => request.method === "GET"));
  });
});
