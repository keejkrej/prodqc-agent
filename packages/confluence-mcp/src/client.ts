import type { Config } from "./config.js";
import { ConfluenceHttpError } from "./errors.js";
import { parseRetryAfter, RateLimiter, sleep } from "./rate-limit.js";

export interface RecordedRequest {
  readonly method: "GET";
  readonly url: string;
}

export type QueryValue = string | number | boolean | undefined;

/**
 * GET-only HTTP client for Confluence Server REST.
 * There is no post/put/patch/delete — those methods are intentionally absent.
 */
export class ConfluenceClient {
  readonly requests: RecordedRequest[] = [];
  private readonly limiter: RateLimiter;

  constructor(
    readonly config: Config,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.limiter = new RateLimiter(config.minIntervalMs);
  }

  async getJson(path: string, query?: Record<string, QueryValue>): Promise<unknown> {
    const response = await this.getResponse(path, query);
    const text = await response.text();
    if (text.trim() === "") return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ConfluenceHttpError(
        response.status,
        `Response was not JSON: ${text.slice(0, 200)}`,
        path,
      );
    }
  }

  private async getResponse(path: string, query?: Record<string, QueryValue>): Promise<Response> {
    const url = this.resolveUrl(path, query);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      await this.limiter.wait();
      const method = "GET" as const;
      this.requests.push({ method, url: url.toString() });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetchFn(url.toString(), {
          method,
          headers: this.headers(),
          signal: controller.signal,
        });

        if (response.status === 429 && attempt < this.config.maxRetries) {
          await response.arrayBuffer().catch(() => undefined);
          await sleep(parseRetryAfter(response.headers.get("retry-after")));
          continue;
        }

        if (!response.ok) {
          const body = await response.text();
          throw new ConfluenceHttpError(
            response.status,
            summarizeConfluenceBody(body),
            `${url.pathname}${url.search}`,
          );
        }
        return response;
      } catch (error) {
        if (error instanceof ConfluenceHttpError) throw error;
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt >= this.config.maxRetries) throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new Error("GET failed");
  }

  private resolveUrl(path: string, query?: Record<string, QueryValue>): URL {
    const origin = new URL(this.config.baseUrl);
    let url: URL;
    if (/^https?:\/\//i.test(path)) {
      url = new URL(path);
      if (url.origin !== origin.origin) {
        throw new Error(`Refusing to request a different origin: ${url.origin}`);
      }
    } else {
      const suffix = path.startsWith("/") ? path : `/${path}`;
      url = new URL(`${this.config.baseUrl}${suffix}`);
    }
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json, application/octet-stream;q=0.9, */*;q=0.8",
    };
    if (this.config.auth.kind === "pat") {
      headers.Authorization = `Bearer ${this.config.auth.token}`;
    } else {
      const token = Buffer.from(
        `${this.config.auth.username}:${this.config.auth.password}`,
        "utf8",
      ).toString("base64");
      headers.Authorization = `Basic ${token}`;
    }
    return headers;
  }
}

function summarizeConfluenceBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown; reason?: unknown };
    const parts = [parsed.message, parsed.reason]
      .filter((part): part is string => typeof part === "string" && part.length > 0);
    if (parts.length > 0) return parts.join(" ");
  } catch {
    // not JSON
  }
  return trimmed.slice(0, 400);
}
