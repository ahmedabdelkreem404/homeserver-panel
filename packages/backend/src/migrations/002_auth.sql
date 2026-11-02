-- Auth (step 1.2). The role is plain text on purpose (D16): new roles are data in permissions.js, not a schema change.
CREATE TABLE users (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  email                TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL DEFAULT 'owner',
  totp_secret_enc      TEXT,
  totp_enabled         INTEGER NOT NULL DEFAULT 0,
  last_totp_step       INTEGER NOT NULL DEFAULT 0,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

-- Only the SHA-256 of the session token is stored. stage: 'password_ok' (before TOTP) or 'full'.
CREATE TABLE sessions (
  id_hash      TEXT PRIMARY KEY,
  public_id    TEXT NOT NULL UNIQUE,
  user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stage        TEXT NOT NULL CHECK (stage IN ('password_ok', 'full')),
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX sessions_user ON sessions (user_id);

-- Recovery codes are stored as keyed hashes and can be used once.
CREATE TABLE recovery_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX recovery_codes_user ON recovery_codes (user_id);

-- Failed attempts for the lockout. Unknown emails are tracked too, so an unknown and a known account look the same.
CREATE TABLE auth_failures (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK (scope IN ('ip', 'account')),
  key   TEXT NOT NULL,
  at    TEXT NOT NULL
);
CREATE INDEX auth_failures_key ON auth_failures (scope, key, at);
