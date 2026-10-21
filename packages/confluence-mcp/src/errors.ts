export class ConfigError extends Error {
  override readonly name = "ConfigError";

  constructor(message: string) {
    super(message);
  }
}

export class ConfluenceHttpError extends Error {
  override readonly name = "ConfluenceHttpError";
  readonly status: number;
  readonly path: string | undefined;

  constructor(status: number, message: string, path?: string) {
    super(formatHttpError(status, message, path));
    this.status = status;
    this.path = path;
  }
}

function formatHttpError(status: number, message: string, path?: string): string {
  const where = path ? ` for ${path}` : "";
  const detail = message.trim() ? ` ${message.trim()}` : "";
  if (status === 401) {
    return `Confluence returned 401 Unauthorized${where}. Check CONFLUENCE_PAT (Bearer), or CONFLUENCE_USER/CONFLUENCE_PASSWORD if PATs are disabled.${detail}`;
  }
  if (status === 403) {
    return `Confluence returned 403 Forbidden${where}. The account may lack view permission, or the space is outside CONFLUENCE_SPACES.${detail}`;
  }
  if (status === 404) {
    return `Confluence returned 404 Not Found${where}. The page, space, or attachment does not exist.${detail}`;
  }
  return `Confluence returned ${status}${where}.${detail}`;
}
