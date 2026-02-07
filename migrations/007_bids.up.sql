-- Bids table: one row per on-chain bid; high write, low read.
-- Primary key (auction_id, bid_id) for idempotent ingestion.
-- processed_log_id references the log that created/updated this bid.
-- user_id set by trigger (see migration 012) from address lookup in users.
-- Amount and price fields = human-readable decimals.

CREATE TABLE bids (
  auction_id        bigint        NOT NULL REFERENCES auctions (id) ON DELETE CASCADE,
  bid_id            numeric(78,0) NOT NULL,
  address           text          NOT NULL,
  user_id           uuid          REFERENCES users (id),
  amount            numeric(30,18) NOT NULL,
  amount_usd        numeric(30,18),
  max_price         numeric(30,18) NOT NULL,
  clearing_price    numeric(30,18),
  filled_tokens     numeric(30,18),
  status            bid_status    NOT NULL DEFAULT 'open',
  time              timestamptz   NOT NULL,
  processed_log_id  bigint        REFERENCES processed_logs (id),
  PRIMARY KEY (auction_id, bid_id)
);

CREATE INDEX idx_bids_address ON bids (address);
CREATE INDEX idx_bids_auction_id ON bids (auction_id);
CREATE INDEX idx_bids_user_id ON bids (user_id) WHERE user_id IS NOT NULL;
