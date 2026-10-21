import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseStorageLinks } from "../src/links.js";

describe("parseStorageLinks", () => {
  it("extracts ri:page and ri:attachment from ac:link storage XML", () => {
    const storage = [
      '<ac:link><ri:page ri:content-title="Size Measurement" ri:space-key="LAB" /></ac:link>',
      '<ac:link><ri:page ri:content-title="Buffer Prep"></ri:page></ac:link>',
      '<ac:link><ri:attachment ri:filename="notes.txt" /></ac:link>',
    ].join("");
    assert.deepEqual(parseStorageLinks(storage), [
      { kind: "page", title: "Size Measurement", spaceKey: "LAB" },
      { kind: "page", title: "Buffer Prep" },
      { kind: "attachment", filename: "notes.txt" },
    ]);
  });

  it("dedupes repeated targets", () => {
    const storage =
      '<ri:page ri:content-title="A" ri:space-key="LAB" />' +
      '<ri:page ri:content-title="A" ri:space-key="LAB" />';
    assert.equal(parseStorageLinks(storage).length, 1);
  });
});
