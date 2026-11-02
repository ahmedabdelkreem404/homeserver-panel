// One error type with stable codes. Routes never build HTTP errors by hand: toHttpError() is the only mapping.
const STATUS = {
  config_invalid: 500,
  invalid_request: 400,
  procedure_not_allowed: 403,
  policy_refused: 403,
  policy_unresolved: 403, // fail closed: not knowing the owner is a refusal
  upstream_not_found: 404,
  upstream_auth_failed: 502, // Dokploy rejected OUR key: never the panel's own 401
  upstream_unreachable: 502,
  upstream_timeout: 504,
  upstream_error: 502,
  internal_error: 500,
};

export const REFUSAL_CODES = new Set(["procedure_not_allowed", "policy_refused", "policy_unresolved", "invalid_request"]);

export class PanelError extends Error {
  constructor(code, message, { cause, details } = {}) {
    super(message, { cause });
    this.name = "PanelError";
    this.code = code;
    this.status = STATUS[code] ?? 500;
    this.details = details;
  }
}

export function toHttpError(err) {
  if (err instanceof PanelError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  if (err?.validation) return { status: 400, body: { error: { code: "invalid_request", message: "The request is not valid." } } };
  return { status: 500, body: { error: { code: "internal_error", message: "Something went wrong." } } };
}

// Maps a non-2xx answer from Dokploy. The 401 case is deliberately NOT a 401 for our own caller.
export function errorFromUpstream(status, procedure) {
  if (status === 401 || status === 403) return new PanelError("upstream_auth_failed", `Dokploy rejected the panel's key for ${procedure}.`);
  if (status === 404) return new PanelError("upstream_not_found", `Dokploy has no such item for ${procedure}.`);
  return new PanelError("upstream_error", `Dokploy failed on ${procedure} (HTTP ${status}).`);
}
