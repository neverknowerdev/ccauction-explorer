-- Widen price-related numeric columns to avoid overflow for large valid prices.
-- Previous type: numeric(30,18) => max abs value < 1e12.
-- New type:      numeric(38,18) => max abs value < 1e20.
--
-- This is a widening change and does not truncate existing data.

ALTER TABLE auctions
  ALTER COLUMN floor_price TYPE numeric(38,18),
  ALTER COLUMN current_clearing_price TYPE numeric(38,18);

ALTER TABLE bids
  ALTER COLUMN max_price TYPE numeric(38,18),
  ALTER COLUMN clearing_price TYPE numeric(38,18);

ALTER TABLE clearing_price_history
  ALTER COLUMN clearing_price TYPE numeric(38,18);
