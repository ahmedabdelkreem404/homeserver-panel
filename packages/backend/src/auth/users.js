// Users and their second factor. Roles-ready (D16): `role` is stored text; permissions live in permissions.js.
import crypto from "node:crypto";
import { PanelError } from "../errors.js";
import { open, seal, keyedHash } from "./secretbox.js";
import { generateSecret } from "./totp.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no 0/O/1/I/L: easy to read from paper
const RECOVERY_CODE_COUNT = 10;

function newRecoveryCode() {
  const pick = n => Array.from(crypto.randomBytes(n), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${pick(5)}-${pick(5)}`;
}
const normalizeCode = code => String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function createUsers(db, { secretKey, now = () => new Date() }) {
  const iso = () => now().toISOString();
  const byEmail = db.prepare("SELECT * FROM users WHERE email = ?");
  const byId = db.prepare("SELECT * FROM users WHERE id = ?");
  const publicUser = u => u && ({ id: u.id, email: u.email, role: u.role, totpEnabled: Boolean(u.totp_enabled), mustChangePassword: Boolean(u.must_change_password) });

  return {
    count: () => Number(db.prepare("SELECT count(*) AS n FROM users").get().n),
    getByEmail: email => byEmail.get(String(email ?? "").trim()),
    getById: id => byId.get(id),
    publicUser,

    createOwner({ email, passwordHash, mustChangePassword = true }) {
      const t = iso();
      const r = db.prepare("INSERT INTO users (email, password_hash, role, must_change_password, created_at, updated_at) VALUES (?, ?, 'owner', ?, ?, ?)").run(email, passwordHash, mustChangePassword ? 1 : 0, t, t);
      return byId.get(Number(r.lastInsertRowid));
    },

    // Accounts the owner creates: never an owner, always forced to pick a new password on the first sign-in.
    createManaged({ email, passwordHash, role, tenantId = null }) {
      const t = iso();
      const r = db.prepare("INSERT INTO users (email, password_hash, role, tenant_id, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").run(email, passwordHash, role, tenantId, t, t);
      return byId.get(Number(r.lastInsertRowid));
    },
    setTemporaryPassword(id, passwordHash) {
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?").run(passwordHash, iso(), id);
    },
    setDisabled(id, disabled) {
      db.prepare("UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?").run(disabled ? 1 : 0, iso(), id);
    },

    setPassword(id, passwordHash) {
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?").run(passwordHash, iso(), id);
    },

    // The secret is kept encrypted and only becomes active once a code from it was confirmed.
    beginTotpEnrollment(id) {
      const secret = generateSecret();
      db.prepare("UPDATE users SET totp_secret_enc = ?, totp_enabled = 0, last_totp_step = 0, updated_at = ? WHERE id = ?").run(seal(secretKey, secret), iso(), id);
      return secret;
    },
    totpSecret(user) {
      if (!user?.totp_secret_enc) return null;
      try { return open(secretKey, user.totp_secret_enc); } catch { return null; }
    },
    enableTotp(id, step) {
      db.prepare("UPDATE users SET totp_enabled = 1, last_totp_step = ?, updated_at = ? WHERE id = ?").run(step, iso(), id);
    },
    // Compare-and-set: two parallel requests with the same code cannot both pass.
    acceptTotpStep(id, step) {
      return Number(db.prepare("UPDATE users SET last_totp_step = ?, updated_at = ? WHERE id = ? AND last_totp_step < ?").run(step, iso(), id, step).changes) === 1;
    },

    // Returns the plain codes once; only keyed hashes are stored.
    replaceRecoveryCodes(id) {
      const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM recovery_codes WHERE user_id = ?").run(id);
        const insert = db.prepare("INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)");
        for (const c of codes) insert.run(id, keyedHash(secretKey, normalizeCode(c)), iso());
        db.exec("COMMIT");
      } catch (e) { db.exec("ROLLBACK"); throw e; }
      return codes;
    },
    consumeRecoveryCode(id, code) {
      const hash = keyedHash(secretKey, normalizeCode(code));
      return Number(db.prepare("UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL").run(iso(), id, hash).changes) === 1;
    },
    recoveryCodesLeft: id => Number(db.prepare("SELECT count(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").get(id).n),
  };
}

// First boot only: creates the single owner from the environment. There is no signup route.
export function ensureOwner({ users, owner, log }) {
  if (users.count() > 0) return false;
  if (!owner) { log?.warn("no owner exists and OWNER_EMAIL / OWNER_PASSWORD_HASH are not set: nobody can log in"); return false; }
  users.createOwner({ email: owner.email, passwordHash: owner.passwordHash, mustChangePassword: true });
  log?.info("owner account created from the environment (password change required at first login)");
  return true;
}

export function requireUser(user) {
  if (!user) throw new PanelError("unauthenticated", "Sign in first.");
  return user;
}
