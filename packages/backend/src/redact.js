// Field-based and value-based redaction, shared by the gateway outputs, the audit log and the logger.
const SENSITIVE_FIELD = /(^env$|buildargs|buildsecrets|password|passwd|token|secret|apikey|^key$|authorization|cookie|privatekey|refreshtoken)/i;
export const REDACTED = "[REDACTED]";

// Deep copy where sensitive fields are replaced. `allow` lists field names that may pass (e.g. the one-time new key).
export function scrub(value, { allow = [], secrets = [] } = {}) {
  if (typeof value === "string") return secrets.length ? redactString(value, secrets) : value; // value-based: known secrets inside any string
  if (Array.isArray(value)) return value.map(v => scrub(v, { allow, secrets }));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = !allow.includes(k) && SENSITIVE_FIELD.test(k) && v !== null && v !== undefined && v !== "" ? REDACTED : scrub(v, { allow, secrets });
    return out;
  }
  return value;
}

export function redactString(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (typeof s === "string" && s.length >= 8) out = out.split(s).join(REDACTED);
  return out;
}
