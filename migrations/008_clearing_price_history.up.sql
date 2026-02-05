-- Clearing price history: time series of clearing price per auction.
-- processed_log_id references the log that recorded this price update.

CREATE TABLE clearing_price_history (
  id               bigserial     NOT NULL PRIMARY KEY,
  auction_id       bigint        NOT NULL REFERENCES auctions (id) ON DELETE CASCADE,
  time             timestamptz   NOT NULL,
  clearing_price   numeric(30,18) NOT NULL,
  processed_log_id bigint        REFERENCES processed_logs (id)
);

CREATE INDEX idx_clearing_price_history_auction_id ON clearing_price_history (auction_id);
