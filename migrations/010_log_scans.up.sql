-- Log scans: tracks the latest scanned block per chain for periodic cron jobs.

CREATE TABLE log_scans (
  id                     bigserial NOT NULL PRIMARY KEY,
  chain_id               integer   NOT NULL REFERENCES chains (id) ON DELETE CASCADE UNIQUE,
  latest_scanned_block   bigint    NOT NULL,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
