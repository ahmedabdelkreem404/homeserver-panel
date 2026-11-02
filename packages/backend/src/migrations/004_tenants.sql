-- Hosting accounts (step 3.1). A tenant is a customer account: one user, one quota, and the Dokploy things it owns.
-- Suspension is per user (users.disabled), so it also covers admins and viewers.
CREATE TABLE tenants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE quotas (
  tenant_id      INTEGER PRIMARY KEY REFERENCES tenants (id) ON DELETE CASCADE,
  max_apps       INTEGER NOT NULL DEFAULT 2,
  max_databases  INTEGER NOT NULL DEFAULT 1,
  max_memory_mb  INTEGER NOT NULL DEFAULT 512,
  max_cpu        REAL    NOT NULL DEFAULT 1,
  max_disk_mb    INTEGER NOT NULL DEFAULT 2048,
  max_subdomains INTEGER NOT NULL DEFAULT 2,
  max_upload_mb  INTEGER NOT NULL DEFAULT 50
);

ALTER TABLE users ADD COLUMN tenant_id INTEGER REFERENCES tenants (id);
ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
CREATE INDEX users_tenant ON users (tenant_id);

-- Every Dokploy project, app, database or domain created for a tenant through the panel. Authorization of tenant
-- requests is decided from this table, never from an id the client sends.
CREATE TABLE resource_ownership (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id  INTEGER NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('project', 'application', 'database', 'domain')),
  dokploy_id TEXT NOT NULL,
  name       TEXT,
  created_by INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL,
  UNIQUE (kind, dokploy_id)
);
CREATE INDEX resource_ownership_tenant ON resource_ownership (tenant_id, kind);
