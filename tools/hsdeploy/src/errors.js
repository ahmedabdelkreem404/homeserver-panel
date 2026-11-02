// One error type with a stable "kind" so commands can react and exit codes stay meaningful.
export const EXIT = { OK: 0, FAILED: 1, USAGE: 2, REFUSED: 3, TIMEOUT: 4, AUTH: 5 };

export class HsError extends Error {
  constructor(kind, message, { exitCode, cause } = {}) {
    super(message, { cause });
    this.name = "HsError";
    this.kind = kind;
    this.exitCode = exitCode ?? { usage: EXIT.USAGE, refused: EXIT.REFUSED, timeout: EXIT.TIMEOUT, auth: EXIT.AUTH }[kind] ?? EXIT.FAILED;
  }
}

// Maps an HTTP status from Dokploy to an error kind. The api key is never part of any message.
export function errorFromHttp(status, procedure, bodyText) {
  const detail = extractMessage(bodyText);
  if (status === 401 || status === 403) return new HsError("auth", `Dokploy rejected the key for ${procedure} (HTTP ${status}). The key may be revoked, expired or rate limited. ${detail}`.trim());
  if (status === 404) return new HsError("notfound", `Not found: ${procedure} (HTTP 404). ${detail}`.trim());
  if (status === 400) return new HsError("invalid", `Dokploy rejected the request to ${procedure} (HTTP 400). ${detail}`.trim());
  if (status >= 500) return new HsError("server", `Dokploy failed on ${procedure} (HTTP ${status}). ${detail}`.trim());
  return new HsError("failed", `Unexpected HTTP ${status} from ${procedure}. ${detail}`.trim());
}

function extractMessage(text) {
  try {
    const j = JSON.parse(text);
    const m = typeof j === "string" ? j : j.message || j.error?.message || "";
    return String(m).slice(0, 200);
  } catch {
    return "";
  }
}
