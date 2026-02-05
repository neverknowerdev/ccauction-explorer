-- Processed logs: idempotency for blockchain event processing (e.g. Alchemy webhooks).
-- One row per log; unique key (chain_id, block_number, transaction_hash, log_index) prevents double-processing.
-- event_topic_id links to event_topics (topic0); nullable if we store logs for unregistered topics.
-- source: ALCHEMY_WEBHOOK (webhook) or scanScript (scan-blocks script).

CREATE TYPE processed_log_source AS ENUM (
  'ALCHEMY_WEBHOOK',
  'scanScript'
);

CREATE TABLE processed_logs (
  id                bigserial   NOT NULL PRIMARY KEY,
  chain_id          integer     NOT NULL REFERENCES chains (id),
  block_number      bigint      NOT NULL,
  transaction_hash  text        NOT NULL,
  log_index         integer     NOT NULL,
  event_topic_id    bigint      REFERENCES event_topics (id),
  processed_at      timestamptz NOT NULL DEFAULT now(),
  contract_address  text,
  params            jsonb,
  is_error          boolean     NOT NULL DEFAULT false,
  source            processed_log_source NOT NULL DEFAULT 'ALCHEMY_WEBHOOK',
  UNIQUE (chain_id, block_number, transaction_hash, log_index)
);

CREATE INDEX idx_processed_logs_chain_block ON processed_logs (chain_id, block_number);
