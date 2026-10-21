import { ConfigError } from "./errors.js";

export type Auth =
  | { readonly kind: "pat"; readonly token: string }
  | { readonly kind: "basic"; readonly username: string; readonly password: string };

export interface Config {
  readonly baseUrl: string;
  readonly auth: Auth;
  readonly allowedSpaces: readonly string[] | undefined;
  readonly minIntervalMs: number;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

export function loadConfig(env: NodeJS.Dict<string> = process.env): Config {
  const rawBase = env.CONFLUENCE_BASE_URL?.trim();
  if (!rawBase) {
    throw new ConfigError("CONFLUENCE_BASE_URL is required (origin of the self-hosted Confluence Server, with no trailing slash required)");
  }
  let baseUrl: string;
  try {
    const url = new URL(rawBase);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
    baseUrl = `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    throw new ConfigError("CONFLUENCE_BASE_URL must be an absolute http(s) URL");
  }

  const pat = env.CONFLUENCE_PAT?.trim();
  const username = env.CONFLUENCE_USER?.trim();
  const password = env.CONFLUENCE_PASSWORD;
  const hasBasic = Boolean(username) && password !== undefined && password.length > 0;

  let auth: Auth;
  if (pat && hasBasic) {
    throw new ConfigError("Set CONFLUENCE_PAT or CONFLUENCE_USER/CONFLUENCE_PASSWORD, not both");
  }
  if (pat) {
    auth = { kind: "pat", token: pat };
  } else if (username && hasBasic) {
    auth = { kind: "basic", username, password: password ?? "" };
  } else {
    throw new ConfigError("Provide CONFLUENCE_PAT (Bearer) or both CONFLUENCE_USER and CONFLUENCE_PASSWORD (basic auth)");
  }

  const spacesRaw = env.CONFLUENCE_SPACES?.trim();
  const allowedSpaces = spacesRaw
    ? spacesRaw.split(",").map((key) => key.trim()).filter((key) => key.length > 0)
    : undefined;

  return {
    baseUrl,
    auth,
    allowedSpaces: allowedSpaces && allowedSpaces.length > 0 ? allowedSpaces : undefined,
    minIntervalMs: readPositiveInt(env.CONFLUENCE_MIN_INTERVAL_MS, 150),
    timeoutMs: readPositiveInt(env.CONFLUENCE_TIMEOUT_MS, 30_000),
    maxRetries: readPositiveInt(env.CONFLUENCE_MAX_RETRIES, 3),
  };
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new ConfigError(`Expected a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}
