import { ConfluenceHttpError } from "./errors.js";

export function assertSpaceAllowed(
  spaceKey: string,
  allowedSpaces: readonly string[] | undefined,
): void {
  if (!allowedSpaces || allowedSpaces.length === 0) return;
  if (!allowedSpaces.includes(spaceKey)) {
    throw new ConfluenceHttpError(
      403,
      `Space "${spaceKey}" is not in CONFLUENCE_SPACES allowlist (${allowedSpaces.join(", ")})`,
    );
  }
}

export function extractCqlSpaceKeys(cql: string): string[] {
  const keys: string[] = [];
  const inPattern = /space\s+in\s*\(([^)]+)\)/gi;
  for (const match of cql.matchAll(inPattern)) {
    const inner = match[1] ?? "";
    for (const part of inner.split(",")) {
      const key = part.trim().replace(/^["']|["']$/g, "");
      if (key) keys.push(key);
    }
  }
  const eqPattern = /space\s*=\s*["']?([A-Za-z0-9_]+)["']?/gi;
  for (const match of cql.matchAll(eqPattern)) {
    const key = match[1];
    if (key) keys.push(key);
  }
  return keys;
}

/** Reject CQL that names a disallowed space, then AND the allowlist. */
export function constrainCql(cql: string, allowedSpaces: readonly string[] | undefined): string {
  if (!allowedSpaces || allowedSpaces.length === 0) return cql;
  for (const key of extractCqlSpaceKeys(cql)) {
    assertSpaceAllowed(key, allowedSpaces);
  }
  const clause = `space in (${allowedSpaces.map((key) => `"${key}"`).join(", ")})`;
  return `(${cql}) AND ${clause}`;
}

export function filterAllowed<T>(
  items: readonly T[],
  spaceKeyOf: (item: T) => string | undefined,
  allowedSpaces: readonly string[] | undefined,
): T[] {
  if (!allowedSpaces || allowedSpaces.length === 0) return [...items];
  return items.filter((item) => {
    const key = spaceKeyOf(item);
    return key !== undefined && allowedSpaces.includes(key);
  });
}
