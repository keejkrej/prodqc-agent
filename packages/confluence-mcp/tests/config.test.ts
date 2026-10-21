import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "../src/config.js";
import { ConfigError } from "../src/errors.js";

describe("loadConfig", () => {
  it("prefers PAT Bearer auth over basic when both are set", () => {
    const config = loadConfig({
      CONFLUENCE_BASE_URL: "https://confluence.example.com/",
      CONFLUENCE_PAT: "token-1",
      CONFLUENCE_USER: "ignored",
      CONFLUENCE_PASSWORD: "ignored",
      CONFLUENCE_SPACES: "LAB, QC",
    });
    assert.equal(config.baseUrl, "https://confluence.example.com");
    assert.deepEqual(config.auth, { kind: "pat", token: "token-1" });
    assert.deepEqual(config.allowedSpaces, ["LAB", "QC"]);
  });

  it("falls back to basic auth when PAT is unset", () => {
    const config = loadConfig({
      CONFLUENCE_BASE_URL: "https://confluence.example.com",
      CONFLUENCE_USER: "wikiuser",
      CONFLUENCE_PASSWORD: "wikipass",
    });
    assert.deepEqual(config.auth, { kind: "basic", username: "wikiuser", password: "wikipass" });
    assert.equal(config.allowedSpaces, undefined);
  });

  it("rejects missing credentials", () => {
    assert.throws(
      () => loadConfig({ CONFLUENCE_BASE_URL: "https://confluence.example.com" }),
      ConfigError,
    );
  });
});
