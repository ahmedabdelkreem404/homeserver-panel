// Hosting accounts, owner-managed: create a user (and, for the tenant role, its tenant and quota), reset a password,
// suspend or resume, change a quota. Every change is audited without secrets; a temporary password is returned once.
import crypto from "node:crypto";
import { PanelError } from "../errors.js";
import { hashPassword } from "../auth/password.js";
import { ASSIGNABLE_ROLES } from "../auth/permissions.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z][a-z0-9-]{1,22}[a-z0-9]$/;
// Names that would clash with the panel's own hosts and projects when a slug becomes part of a subdomain.
const RESERVED_SLUGS = new Set(["panel", "mcp", "www", "root", "api", "admin", "dokploy", "traefik", "infra", "shared", "homeserver", "mail", "ftp", "smtp", "ns1", "ns2", "hs"]);
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz23456789"; // no look-alikes

export const QUOTA_RANGES = Object.freeze({
  maxApps: [0, 50], maxDatabases: [0, 50], maxMemoryMb: [0, 3000], maxCpu: [0, 4], maxDiskMb: [0, 100_000], maxSubdomains: [0, 50], maxUploadMb: [1, 500],
});
const QUOTA_COLUMNS = Object.freeze({ maxApps: "max_apps", maxDatabases: "max_databases", maxMemoryMb: "max_memory_mb", maxCpu: "max_cpu", maxDiskMb: "max_disk_mb", maxSubdomains: "max_subdomains", maxUploadMb: "max_upload_mb" });

const invalid = message => new PanelError("invalid_request", message);
const newTemporaryPassword = () => {
  const pick = n => Array.from(crypto.randomBytes(n), b => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("");
  return `${pick(5)}-${pick(5)}-${pick(5)}-${pick(5)}`;
};

export function normalizeQuota(input = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    const range = QUOTA_RANGES[key];
    if (!range) throw invalid(`Unknown quota field "${key}".`);
    if (!Number.isFinite(value) || value < range[0] || value > range[1] || (key !== "maxCpu" && !Number.isInteger(value))) throw invalid(`Quota "${key}" must be between ${range[0]} and ${range[1]}.`);
    out[key] = value;
  }
  return out;
}

export function createAccounts({ db, users, sessions, audit, now = () => new Date() }) {
  const iso = () => now().toISOString();
  const quotaOf = tenantId => {
    const q = db.prepare("SELECT * FROM quotas WHERE tenant_id = ?").get(tenantId);
    return q && { maxApps: q.max_apps, maxDatabases: q.max_databases, maxMemoryMb: q.max_memory_mb, maxCpu: q.max_cpu, maxDiskMb: q.max_disk_mb, maxSubdomains: q.max_subdomains, maxUploadMb: q.max_upload_mb };
  };
  const summary = row => ({
    id: row.id, email: row.email, role: row.role, disabled: Boolean(row.disabled), totpEnabled: Boolean(row.totp_enabled), mustChangePassword: Boolean(row.must_change_password), createdAt: row.created_at,
    tenant: row.tenant_id ? { id: row.tenant_id, slug: row.tenant_slug, name: row.tenant_name, quota: quotaOf(row.tenant_id) } : null,
  });
  const select = "SELECT u.*, t.slug AS tenant_slug, t.name AS tenant_name FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id";

  // Runs a change as one audited step: the row exists before the work, and ends ok or error.
  async function audited(ctx, action, target, work) {
    const rowId = audit.begin({ actor: ctx.actor, action, target });
    try { const { result, detail } = await work(); audit.finish(rowId, "ok", detail ?? {}); return result; }
    catch (e) { audit.finish(rowId, e instanceof PanelError && e.code !== "internal_error" ? "refused" : "error", { code: e.code ?? "error" }); throw e; }
  }
  const target = id => {
    const row = db.prepare(`${select} WHERE u.id = ?`).get(id);
    if (!row) throw new PanelError("upstream_not_found", "No such user.");
    if (row.role === "owner") throw new PanelError("forbidden", "The owner account cannot be changed here.");
    return row;
  };

  const writeQuota = (tenantId, limits) => {
    for (const [key, value] of Object.entries(limits)) db.prepare(`UPDATE quotas SET ${QUOTA_COLUMNS[key]} = ? WHERE tenant_id = ?`).run(value, tenantId);
  };

  return {
    list: () => db.prepare(`${select} ORDER BY u.id`).all().map(summary),

    create(ctx, { email, role, tenant, quota }) {
      return audited(ctx, "users.create", null, async () => {
        const address = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (!EMAIL.test(address) || address.length > 320) throw invalid("That email address is not valid.");
        if (!ASSIGNABLE_ROLES.includes(role)) throw invalid(`Role must be one of ${ASSIGNABLE_ROLES.join(", ")}.`);
        if (users.getByEmail(address)) throw invalid("That email is already used.");
        let tenantId = null;
        const limits = normalizeQuota(quota ?? {});
        const password = newTemporaryPassword();
        const passwordHash = hashPassword(password);
        db.exec("BEGIN");
        try {
          if (role === "tenant") {
            const slug = typeof tenant?.slug === "string" ? tenant.slug.trim() : "";
            const name = typeof tenant?.name === "string" ? tenant.name.trim() : "";
            if (!SLUG.test(slug) || RESERVED_SLUGS.has(slug)) throw invalid("The account slug must be 3 to 24 lowercase letters, digits or dashes, start with a letter, and not be a reserved name.");
            if (!name || name.length > 80) throw invalid("The account name must be 1 to 80 characters.");
            if (db.prepare("SELECT 1 FROM tenants WHERE slug = ?").get(slug)) throw invalid("That account slug is already used.");
            const t = iso();
            tenantId = Number(db.prepare("INSERT INTO tenants (slug, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(slug, name, t, t).lastInsertRowid);
            db.prepare("INSERT INTO quotas (tenant_id) VALUES (?)").run(tenantId);
            writeQuota(tenantId, limits);
          } else if (tenant || Object.keys(limits).length) throw invalid("Only the tenant role has an account and a quota.");
          const created = users.createManaged({ email: address, passwordHash, role, tenantId });
          db.exec("COMMIT");
          const row = db.prepare(`${select} WHERE u.id = ?`).get(created.id);
          return { result: { user: summary(row), temporaryPassword: password }, detail: { userId: created.id, role, tenant: row.tenant_slug ?? null } };
        } catch (e) { db.exec("ROLLBACK"); throw e; }
      });
    },

    // The old password stops working and every session of that user ends; the next sign-in forces a new password.
    resetPassword(ctx, userId) {
      return audited(ctx, "users.reset_password", `user:${userId}`, async () => {
        const row = target(userId);
        const password = newTemporaryPassword();
        users.setTemporaryPassword(row.id, hashPassword(password));
        const ended = sessions.revokeAll(row.id);
        return { result: { temporaryPassword: password }, detail: { sessionsEnded: ended } };
      });
    },

    setSuspended(ctx, userId, suspended) {
      return audited(ctx, suspended ? "users.suspend" : "users.resume", `user:${userId}`, async () => {
        const row = target(userId);
        if (row.id === ctx.userId) throw new PanelError("forbidden", "You cannot suspend your own account.");
        users.setDisabled(row.id, suspended);
        const ended = suspended ? sessions.revokeAll(row.id) : 0;
        return { result: { ok: true }, detail: { sessionsEnded: ended } };
      });
    },

    updateQuota(ctx, userId, patch) {
      return audited(ctx, "users.quota", `user:${userId}`, async () => {
        const row = target(userId);
        if (!row.tenant_id) throw invalid("Only a tenant account has a quota.");
        const limits = normalizeQuota(patch ?? {});
        if (!Object.keys(limits).length) throw invalid("Send at least one quota field.");
        writeQuota(row.tenant_id, limits);
        return { result: { quota: quotaOf(row.tenant_id) }, detail: { fields: Object.keys(limits) } };
      });
    },

    quotaOf,

    tenantInfo(tenantId) {
      const row = db.prepare("SELECT id, slug, name FROM tenants WHERE id = ?").get(tenantId);
      if (!row) throw new PanelError("upstream_not_found", "No such account.");
      return { id: row.id, slug: row.slug, name: row.name };
    },

    // The tenant behind a user id, for the owner's per-account screens.
    tenantIdOf(userId) {
      const row = target(userId);
      if (!row.tenant_id) throw invalid("Only a tenant account has sites.");
      return row.tenant_id;
    },
  };
}
