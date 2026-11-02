// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) with node:crypto only. A code is accepted only if its time step is
// newer than the last accepted one, so a replayed code (even inside its window) is rejected.
import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
export const WINDOW_STEPS = 1;

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  let bits = 0, value = 0;
  const out = [];
  for (const ch of String(text).toUpperCase().replace(/[\s=-]/g, "")) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function generateSecret() { return crypto.randomBytes(20); }

export function hotp(secret, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 15;
  const bin = ((h[offset] & 127) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepAt = nowMs => Math.floor(nowMs / 1000 / STEP_SECONDS);
export const totpAt = (secret, nowMs) => hotp(secret, stepAt(nowMs));

// Returns the matched time step, or null. lastStep is the newest step already used for this account.
export function verifyTotp(secret, code, nowMs, lastStep = 0) {
  const given = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const current = stepAt(nowMs);
  let match = null;
  for (let step = current - WINDOW_STEPS; step <= current + WINDOW_STEPS; step++) {
    const expected = hotp(secret, step);
    const same = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given)); // always evaluate every step
    if (same && step > lastStep) match = step;
  }
  return match;
}

export function otpauthUri({ secret, email, issuer }) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${base32Encode(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
