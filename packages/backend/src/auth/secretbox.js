// AES-256-GCM for the TOTP secret at rest, and HMAC for recovery codes. The key comes from PANEL_SECRET_KEY.
import crypto from "node:crypto";

// Accepts 32 bytes as hex (64 chars) or base64/base64url. Returns a Buffer or null.
export function parseSecretKey(text) {
  const t = String(text ?? "").trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) return Buffer.from(t, "hex");
  if (/^[A-Za-z0-9_-]{43}=?$/.test(t) || /^[A-Za-z0-9+/]{43}=?$/.test(t)) {
    const buf = Buffer.from(t, /[-_]/.test(t) ? "base64url" : "base64");
    return buf.length === 32 ? buf : null;
  }
  return null;
}

export function seal(key, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map(b => b.toString("base64url")).join(".");
}

export function open(key, sealed) {
  const [iv, tag, ct] = String(sealed).split(".").map(p => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export const keyedHash = (key, text) => crypto.createHmac("sha256", key).update(String(text)).digest("hex");
export const sha256 = text => crypto.createHash("sha256").update(String(text)).digest("hex");
