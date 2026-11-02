import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_MS = 30_000;

function base32Decode(text) {
  let bits = "";
  for (const ch of text.replace(/[\s=]/g, "").toUpperCase()) bits += ALPHABET.indexOf(ch).toString(2).padStart(5, "0");
  return Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
}

export const currentStep = (nowMs = Date.now()) => Math.floor(nowMs / STEP_MS);

// RFC 6238, SHA-1, 6 digits, 30 s steps.
export function totpForStep(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = mac[19] & 15;
  return String((mac.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// The panel accepts the current window and one either side, but never a step it has already accepted.
// This hands out a step newer than the last one used, waiting for the clock when none is left in the window.
export function createTotpSource(secret) {
  let last = 0;
  return async function nextCode() {
    for (;;) {
      const step = Math.max(last + 1, currentStep());
      if (step <= currentStep() + 1) { last = step; return totpForStep(secret, step); }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  };
}
