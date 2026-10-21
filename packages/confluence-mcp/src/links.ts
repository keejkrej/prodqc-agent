export type ParsedLink =
  | { readonly kind: "page"; readonly title: string; readonly spaceKey?: string }
  | { readonly kind: "attachment"; readonly filename: string };

const PAGE_TAG = /<ri:page\b([^>]*)\/?\s*>/gi;
const ATTACHMENT_TAG = /<ri:attachment\b([^>]*)\/?\s*>/gi;

/** Pull outgoing wiki/attachment targets out of Confluence storage XML. */
export function parseStorageLinks(storageXml: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  const seen = new Set<string>();

  for (const match of storageXml.matchAll(PAGE_TAG)) {
    const attrs = match[1] ?? "";
    const title = readAttr(attrs, "ri:content-title");
    if (!title) continue;
    const spaceKey = readAttr(attrs, "ri:space-key");
    const key = `page:${spaceKey ?? ""}:${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(spaceKey ? { kind: "page", title, spaceKey } : { kind: "page", title });
  }

  for (const match of storageXml.matchAll(ATTACHMENT_TAG)) {
    const attrs = match[1] ?? "";
    const filename = readAttr(attrs, "ri:filename");
    if (!filename) continue;
    const key = `attachment:${filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ kind: "attachment", filename });
  }

  return links;
}

function readAttr(attrs: string, name: string): string | undefined {
  const doubleQuoted = new RegExp(`${escapeRegExp(name)}\\s*=\\s*"([^"]*)"`, "i").exec(attrs);
  if (doubleQuoted?.[1]) return decodeXml(doubleQuoted[1]);
  const singleQuoted = new RegExp(`${escapeRegExp(name)}\\s*=\\s*'([^']*)'`, "i").exec(attrs);
  if (singleQuoted?.[1]) return decodeXml(singleQuoted[1]);
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
