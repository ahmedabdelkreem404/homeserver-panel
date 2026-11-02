-- One row per mutating call. The row is inserted as 'pending' before the call and finished afterwards.
CREATE TABLE audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT NOT NULL,
  actor   TEXT NOT NULL,
  action  TEXT NOT NULL,
  target  TEXT,
  result  TEXT NOT NULL CHECK (result IN ('pending', 'ok', 'refused', 'error')),
  detail  TEXT
);
CREATE INDEX audit_log_at ON audit_log (at);
