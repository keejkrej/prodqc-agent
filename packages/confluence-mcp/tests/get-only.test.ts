import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createHandlers } from "../src/api.js";
import { ConfluenceClient } from "../src/client.js";
import type { Config } from "../src/config.js";
import { VALID_PASSWORD, VALID_PAT, VALID_USER } from "./fixtures/synthetic.js";
import { startMockConfluence } from "./helpers/mock-confluence.js";

const WRITE_METHODS = /^(POST|PUT|PATCH|DELETE)$/i;
const WRITE_NAME = /^(post|put|patch|delete|write|create|update|remove)$/i;

function testConfig(baseUrl: string, auth: Config["auth"] = { kind: "pat", token: VALID_PAT }): Config {
  return {
    baseUrl,
    auth,
    allowedSpaces: undefined,
    minIntervalMs: 0,
    timeoutMs: 5_000,
    maxRetries: 1,
  };
}

describe("GET-only contract", () => {
  it("does not expose write methods on ConfluenceClient", () => {
    const names = Object.getOwnPropertyNames(ConfluenceClient.prototype);
    for (const name of names) {
      assert.equal(WRITE_NAME.test(name), false, `unexpected write method ${name}`);
    }
  });

  it("source never sets a non-GET HTTP method", async () => {
    const srcDir = path.join(import.meta.dirname, "../../src");
    const files = await collectTsFiles(srcDir);
    assert.ok(files.length > 0);
    for (const file of files) {
      const text = await readFile(file, "utf8");
      assert.equal(
        /method:\s*["'](POST|PUT|PATCH|DELETE)["']/.test(text),
        false,
        `${file} sets a write HTTP method`,
      );
      assert.equal(
        /["'](POST|PUT|PATCH|DELETE)["']\s+/.test(text) && /fetch\(/.test(text) && /method:\s*["'](?!GET)/.test(text),
        false,
        `${file} looks like it issues a write fetch`,
      );
    }
  });

  it("never makes a non-GET request while exercising every tool", async () => {
    const mock = await startMockConfluence();
    try {
      const client = new ConfluenceClient(testConfig(mock.baseUrl));
      const handlers = createHandlers(client);
      const dir = await mkdtemp(path.join(tmpdir(), "confluence-get-only-"));

      await handlers.check_instance();
      await handlers.get_page_links({ id: "1002" });
      await handlers.get_history({ id: "1002" });
      await handlers.build_space_graph({
        spaceKey: "LAB",
        outputPath: path.join(dir, "graph.json"),
        includeLinks: true,
      });
      await handlers.list_spaces({ start: 0, limit: 10 });
      await handlers.search({ cql: "type=page AND space=LAB", start: 0, limit: 2 });
      await handlers.get_page({ id: "1002", body: "both" });
      await handlers.get_children({ id: "1001", start: 0, limit: 10 });

      const basic = new ConfluenceClient(
        testConfig(mock.baseUrl, { kind: "basic", username: VALID_USER, password: VALID_PASSWORD }),
      );
      await createHandlers(basic).check_instance();

      assert.ok(mock.requests.length > 0, "expected the mock to see traffic");
      const writes = mock.requests.filter((request) => WRITE_METHODS.test(request.method));
      assert.deepEqual(writes, [], "mock recorded a non-GET request");
      assert.ok(client.requests.every((request) => request.method === "GET"));
      assert.ok(client.requests.some((request) => request.url.includes("/rest/api/content/search?")));
      assert.ok(
        client.requests.every((request) => !request.url.includes("method=POST")),
      );
    } finally {
      await mock.close();
    }
  });
});

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(full)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}
