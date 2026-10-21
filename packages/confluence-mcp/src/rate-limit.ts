export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Spaces GET calls so an old Confluence Server is not hammered. */
export class RateLimiter {
  private nextAllowedAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const delay = Math.max(0, this.nextAllowedAt - now);
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + this.minIntervalMs;
    await sleep(delay);
  }
}

export function parseRetryAfter(header: string | null): number {
  if (!header) return 250;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds)) {
    return clampWait(asSeconds * 1000);
  }
  const when = Date.parse(header);
  if (Number.isFinite(when)) {
    return clampWait(when - Date.now());
  }
  return 250;
}

function clampWait(ms: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.min(ms, 10_000);
}
