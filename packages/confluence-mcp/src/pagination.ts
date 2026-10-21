export interface Paginated<T> {
  readonly results: readonly T[];
  readonly start: number;
  readonly limit: number;
  readonly size: number;
  readonly totalSize?: number;
}

export async function collectAll<T>(
  fetchPage: (start: number, limit: number) => Promise<Paginated<T>>,
  options: { pageSize?: number; maxItems?: number } = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? 25;
  const maxItems = options.maxItems ?? 500;
  const out: T[] = [];
  let start = 0;
  while (out.length < maxItems) {
    const page = await fetchPage(start, pageSize);
    out.push(...page.results);
    if (page.results.length === 0 || page.results.length < pageSize) break;
    start += pageSize;
  }
  return out.slice(0, maxItems);
}

export function asPaginated<T>(
  payload: unknown,
  start: number,
  limit: number,
): Paginated<T> {
  const record = asRecord(payload);
  const results = Array.isArray(record.results) ? (record.results as T[]) : [];
  const totalSize = typeof record.totalSize === "number" ? record.totalSize : undefined;
  return {
    results,
    start: typeof record.start === "number" ? record.start : start,
    limit: typeof record.limit === "number" ? record.limit : limit,
    size: typeof record.size === "number" ? record.size : results.length,
    ...(totalSize !== undefined ? { totalSize } : {}),
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
