// argon2id through node:crypto (no dependency). Parameters suit a 3.8 GiB host: 19 MiB, 2 passes, 1 lane.
// Stored form has no "$" (it travels through env files and Dokploy): argon2id:m:t:p:salt:hash, base64url parts.
import crypto from "node:crypto";

export const ARGON2_PARAMS = Object.freeze({ memory: 19456, passes: 2, parallelism: 1, tagLength: 32 });
const b64u = buf => Buffer.from(buf).toString("base64url");

function derive(password, nonce, params) {
  return crypto.argon2Sync("argon2id", { message: Buffer.from(password, "utf8"), nonce, memory: params.memory, passes: params.passes, parallelism: params.parallelism, tagLength: params.tagLength ?? 32 });
}

export function hashPassword(password, params = ARGON2_PARAMS) {
  const nonce = crypto.randomBytes(16);
  const tag = derive(password, nonce, params);
  return ["argon2id", params.memory, params.passes, params.parallelism, b64u(nonce), b64u(tag)].join(":");
}

export function parseHash(stored) {
  const parts = String(stored ?? "").split(":");
  if (parts.length !== 6 || parts[0] !== "argon2id") return null;
  const [memory, passes, parallelism] = parts.slice(1, 4).map(Number);
  if (![memory, passes, parallelism].every(Number.isInteger) || memory < 8 || passes < 1 || parallelism < 1) return null;
  const nonce = Buffer.from(parts[4], "base64url"), tag = Buffer.from(parts[5], "base64url");
  if (nonce.length < 8 || tag.length < 16) return null;
  return { memory, passes, parallelism, nonce, tag };
}

export function isValidHashFormat(stored) { return parseHash(stored) !== null; }

// Constant-time comparison of the derived tag. A malformed stored hash is simply "no match".
export function verifyPassword(password, stored) {
  const p = parseHash(stored);
  if (!p) return false;
  const tag = derive(password, p.nonce, { memory: p.memory, passes: p.passes, parallelism: p.parallelism, tagLength: p.tag.length });
  return tag.length === p.tag.length && crypto.timingSafeEqual(tag, p.tag);
}

// Used for unknown accounts so a login attempt costs the same whether the email exists or not.
let dummy;
export function verifyAgainstDummy(password) {
  dummy ??= hashPassword("not-a-real-account-password");
  verifyPassword(password, dummy);
  return false;
}

export function passwordProblem(password, { email } = {}) {
  if (typeof password !== "string") return "Password must be text.";
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (password.length > 200) return "Password is too long.";
  if (new Set(password).size < 5) return "Password is too repetitive.";
  if (email && password.toLowerCase().includes(String(email).split("@")[0].toLowerCase()) && String(email).split("@")[0].length >= 4) return "Password must not contain your email name.";
  return null;
}
