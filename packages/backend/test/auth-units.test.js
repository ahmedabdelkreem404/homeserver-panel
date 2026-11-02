import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, isValidHashFormat, parseHash, passwordProblem, verifyPassword } from "../src/auth/password.js";
import { base32Decode, base32Encode, hotp, otpauthUri, stepAt, verifyTotp } from "../src/auth/totp.js";
import { keyedHash, open, parseSecretKey, seal } from "../src/auth/secretbox.js";
import { can, ROLES } from "../src/auth/permissions.js";
import { createLockout, LIMITS } from "../src/auth/lockout.js";
import { ABSOLUTE_MS, IDLE_MS, createSessions } from "../src/auth/sessions.js";
import { migrate, openDatabase } from "../src/db.js";

function db() {
  const d = openDatabase(":memory:");
  migrate(d);
  d.prepare("INSERT INTO users (email, password_hash, created_at, updated_at) VALUES ('a@b.test', 'x', 'now', 'now')").run();
  return d;
}

test("password: argon2id hash verifies, rejects wrong and malformed, and never contains a dollar sign", () => {
  const h = hashPassword("Correct-Horse-Battery-9");
  assert.ok(!h.includes("$"), "safe in env files and Dokploy");
  assert.ok(isValidHashFormat(h));
  assert.deepEqual({ ...parseHash(h), nonce: undefined, tag: undefined }, { memory: 19456, passes: 2, parallelism: 1, nonce: undefined, tag: undefined }, "parameters chosen for a 3.8 GiB host");
  assert.equal(verifyPassword("Correct-Horse-Battery-9", h), true);
  assert.equal(verifyPassword("correct-horse-battery-9", h), false);
  for (const bad of ["", "plain", "argon2id:1:2:3:x:y", "argon2id:19456:2:1:AAAA:AAAA", null, undefined]) assert.equal(verifyPassword("x", bad), false);
  assert.notEqual(hashPassword("same"), hashPassword("same"), "random salt");
});

test("password rules", () => {
  assert.match(passwordProblem("short"), /12 characters/);
  assert.match(passwordProblem("aaaaaaaaaaaaaaaa"), /repetitive/);
  assert.match(passwordProblem("someone-name!!", { email: "someone-name@example.test" }), /email name/);
  assert.equal(passwordProblem("Another-Strong-Pass-678", { email: "owner@example.test" }), null);
  assert.match(passwordProblem(12345), /text/);
});

test("totp: RFC 4226 test vectors, base32 round trip and the RFC 6238 value", () => {
  const secret = Buffer.from("12345678901234567890");
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(c => hotp(secret, c)), ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]);
  assert.equal(hotp(secret, Math.floor(59 / 30), 8), "94287082", "RFC 6238 vector at t=59");
  assert.equal(base32Encode(secret), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.ok(base32Decode(base32Encode(secret)).equals(secret));
  assert.throws(() => base32Decode("!!"), /Invalid base32/);
  assert.match(otpauthUri({ secret, email: "a@b.test", issuer: "Homeserver Panel" }), /^otpauth:\/\/totp\/Homeserver%20Panel%3Aa%40b\.test\?secret=GEZDGNBV.*&issuer=Homeserver%20Panel&algorithm=SHA1&digits=6&period=30$/);
});

test("totp: window of one step each side, a used step is never accepted again, garbage is rejected", () => {
  const secret = Buffer.from("12345678901234567890");
  const now = 1_700_000_010_000;
  const step = stepAt(now);
  const at = s => hotp(secret, s);
  assert.equal(verifyTotp(secret, at(step), now, 0), step);
  assert.equal(verifyTotp(secret, at(step - 1), now, 0), step - 1, "one step late");
  assert.equal(verifyTotp(secret, at(step + 1), now, 0), step + 1, "one step early");
  assert.equal(verifyTotp(secret, at(step - 2), now, 0), null, "two steps late");
  assert.equal(verifyTotp(secret, at(step + 2), now, 0), null);
  assert.equal(verifyTotp(secret, at(step), now, step), null, "replay of the step already used");
  assert.equal(verifyTotp(secret, at(step - 1), now, step), null, "an older step after a newer one");
  for (const bad of ["", "12345", "1234567", "abcdef", null, undefined, 123456.5]) assert.equal(verifyTotp(secret, bad, now, 0), null);
  assert.equal(verifyTotp(secret, ` ${at(step).slice(0, 3)} ${at(step).slice(3)} `, now, 0), step, "spaces typed by the user are ignored");
});

test("secretbox: AES-GCM round trip, tamper detection, key formats", () => {
  const key = Buffer.alloc(32, 7);
  const sealed = seal(key, Buffer.from("totp-secret"));
  assert.equal(open(key, sealed).toString(), "totp-secret");
  assert.notEqual(seal(key, Buffer.from("totp-secret")), sealed, "fresh nonce each time");
  const tampered = sealed.slice(0, -2) + (sealed.endsWith("AA") ? "BB" : "AA");
  assert.throws(() => open(key, tampered));
  assert.throws(() => open(Buffer.alloc(32, 8), sealed), "wrong key");
  assert.ok(parseSecretKey("00".repeat(32)).equals(Buffer.alloc(32)));
  assert.ok(parseSecretKey(Buffer.alloc(32, 1).toString("base64")).equals(Buffer.alloc(32, 1)));
  assert.ok(parseSecretKey(Buffer.alloc(32, 255).toString("base64url")).equals(Buffer.alloc(32, 255)));
  for (const bad of ["", "short", "zz".repeat(32), "00".repeat(31), undefined]) assert.equal(parseSecretKey(bad), null);
  assert.notEqual(keyedHash(key, "ABC"), keyedHash(Buffer.alloc(32, 9), "ABC"));
});

test("permissions: one check, owner may do everything, unknown roles nothing (D16)", () => {
  assert.ok(can({ role: "owner" }, "anything.at.all"));
  assert.equal(can({ role: "viewer" }, "projects.read"), false, "a role that is not defined has no rights");
  assert.equal(can(null, "x"), false);
  assert.equal(can({ role: "owner" }, undefined), true);
  assert.deepEqual(Object.keys(ROLES), ["owner"]);
});

test("sessions: idle 12 h, absolute 7 days, rotation kills the old token, revoke", () => {
  const d = db();
  const clock = { t: Date.parse("2026-11-02T00:00:00Z") };
  const s = createSessions(d, { now: () => new Date(clock.t) });
  const a = s.create({ userId: 1, stage: "password_ok", ip: "1.1.1.1", userAgent: "ua" });
  assert.equal(s.find(a.token).stage, "password_ok");
  assert.ok(!JSON.stringify(d.prepare("SELECT * FROM sessions").all()).includes(a.token), "only the hash is stored");
  const b = s.rotate(a.token, { stage: "full" });
  assert.equal(s.find(a.token), null, "old token dead after rotation");
  assert.equal(s.find(b.token).stage, "full");
  clock.t += IDLE_MS - 1000; assert.ok(s.find(b.token), "just inside the idle limit (and this use refreshes it)");
  clock.t += IDLE_MS + 1000; assert.equal(s.find(b.token), null, "idle for more than 12 h");
  const c = s.create({ userId: 1, stage: "full" });
  const start = clock.t;
  while (clock.t - start < ABSOLUTE_MS - 11 * 3600_000) { clock.t += 11 * 3600_000; assert.ok(s.find(c.token), "kept alive by regular use"); }
  clock.t = start + ABSOLUTE_MS + 1;
  assert.equal(s.find(c.token), null, "older than 7 days even though it was used all the time");
  const e = s.create({ userId: 1, stage: "full" }), f = s.create({ userId: 1, stage: "full" });
  assert.equal(s.revokeOthers(1, e.token), 1);
  assert.equal(s.find(f.token), null);
  assert.ok(s.find(e.token));
  assert.equal(s.revoke(1, "does-not-exist"), 0);
  assert.equal(s.find("short"), null);
  assert.equal(s.find(undefined), null);
});

test("lockout: 5 failures per account, 20 per IP, backoff doubles up to 60 minutes, window forgets", () => {
  const d = db();
  const clock = { t: Date.parse("2026-11-02T00:00:00Z") };
  const l = createLockout(d, { now: () => new Date(clock.t) });
  for (let i = 0; i < LIMITS.account; i++) { assert.equal(l.check("9.9.9.9", "who@x.test").locked, false); l.recordFailure("9.9.9.9", "who@x.test"); clock.t += 1000; }
  const first = l.check("9.9.9.9", "who@x.test");
  assert.equal(first.locked, true);
  assert.ok(first.retryAfterSec > 0 && first.retryAfterSec <= 60, "about a minute at first");
  assert.equal(l.check("8.8.8.8", "other@x.test").locked, false, "other accounts and IPs are not affected");
  clock.t += 61_000;
  assert.equal(l.check("9.9.9.9", "who@x.test").locked, false, "the first lock expires");
  l.recordFailure("9.9.9.9", "who@x.test");
  const second = l.check("9.9.9.9", "who@x.test");
  assert.ok(second.locked && second.retryAfterSec > 60 && second.retryAfterSec <= 120, `doubled: ${second.retryAfterSec}`);
  for (let i = 0; i < 12; i++) l.recordFailure("9.9.9.9", "who@x.test");
  assert.ok(l.check("9.9.9.9", "who@x.test").retryAfterSec <= 3600, "capped at 60 minutes");
  clock.t += 16 * 60_000 + 3_600_000;
  assert.equal(l.check("9.9.9.9", "who@x.test").locked, false, "failures older than 15 minutes are forgotten");
  for (let i = 0; i < LIMITS.ip; i++) l.recordFailure("7.7.7.7", `user${i}@x.test`);
  assert.equal(l.check("7.7.7.7", "fresh@x.test").locked, true, "one IP guessing many accounts is locked");
  l.clearAccount("user0@x.test");
});
