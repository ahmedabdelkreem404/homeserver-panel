-- Network counters sampled once a minute (a few rows per minute, pruned after 40 days) and the speed test results.
CREATE TABLE net_samples (
  at    TEXT NOT NULL,
  iface TEXT NOT NULL,
  rx    INTEGER NOT NULL,
  tx    INTEGER NOT NULL
);
CREATE INDEX net_samples_at ON net_samples (iface, at);

CREATE TABLE speed_tests (
  at        TEXT NOT NULL,
  down_mbps REAL,
  up_mbps   REAL,
  bytes_down INTEGER,
  bytes_up   INTEGER,
  error     TEXT
);
CREATE INDEX speed_tests_at ON speed_tests (at);
