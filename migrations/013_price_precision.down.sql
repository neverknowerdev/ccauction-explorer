-- Revert price-related numeric columns back to numeric(30,18).
-- Safety: abort if any value exceeds numeric(30,18) range (abs(value) >= 1e12),
-- to avoid lossy rollback.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auctions
    WHERE abs(coalesce(floor_price, 0)) >= 1000000000000
       OR abs(coalesce(current_clearing_price, 0)) >= 1000000000000
  ) THEN
    RAISE EXCEPTION 'Cannot downgrade auctions price columns to numeric(30,18): values out of range';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM bids
    WHERE abs(coalesce(max_price, 0)) >= 1000000000000
       OR abs(coalesce(clearing_price, 0)) >= 1000000000000
  ) THEN
    RAISE EXCEPTION 'Cannot downgrade bids price columns to numeric(30,18): values out of range';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM clearing_price_history
    WHERE abs(coalesce(clearing_price, 0)) >= 1000000000000
  ) THEN
    RAISE EXCEPTION 'Cannot downgrade clearing_price_history.clearing_price to numeric(30,18): values out of range';
  END IF;
END $$;

ALTER TABLE clearing_price_history
  ALTER COLUMN clearing_price TYPE numeric(30,18);

ALTER TABLE bids
  ALTER COLUMN max_price TYPE numeric(30,18),
  ALTER COLUMN clearing_price TYPE numeric(30,18);

ALTER TABLE auctions
  ALTER COLUMN floor_price TYPE numeric(30,18),
  ALTER COLUMN current_clearing_price TYPE numeric(30,18);
