import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { ConfigError } from "../src/errors.js";

describe("loadConfig", () => {
  it("accepts a PAT and optional space allowlist", () => {
    const config = loadConfig({
      CONFLUENCE_BASE_URL: "https://confluence.example.com/",
      CONFLUENCE_PAT: "token-1",
      CONFLUENCE_SPACES: "LAB, QC",
    });
    assert.equal(config.baseUrl, "https://confluence.example.com");
    assert.deepEqual(config.auth, { kind: "pat", token: "token-1" });
    assert.deepEqual(config.allowedSpaces, ["LAB", "QC"]);
  });

  it("accepts basic auth", () => {
    const config = loadConfig({
      CONFLUENCE_BASE_URL: "http://wiki.local",
      CONFLUENCE_USER: "labuser",
      CONFLUENCE_PASSWORD: "labpass",
    });
    assert.deepEqual(config.auth, { kind: "basic", username: "labuser", password: "labpass" });
    assert.equal(config.allowedSpaces, undefined);
  });

  it("rejects missing credentials and mixed auth", () => {
    assert.throws(
      () => loadConfig({ CONFLUENCE_BASE_URL: "https://wiki.local" }),
      ConfigError,
    );
    assert.throws(
      () =>
        loadConfig({
          CONFLUENCE_BASE_URL: "https://wiki.local",
          CONFLUENCE_PAT: "x",
          CONFLUENCE_USER: "u",
          CONFLUENCE_PASSWORD: "p",
        }),
      ConfigError,
    );
  });
});
