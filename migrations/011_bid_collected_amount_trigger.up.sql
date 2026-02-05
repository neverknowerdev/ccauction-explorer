-- Function: recompute collected_amount for an auction from sum of bid amounts (on new bid insert)
CREATE OR REPLACE FUNCTION sync_auction_collected_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE auctions
  SET collected_amount = (
    SELECT COALESCE(SUM(amount), 0)
    FROM bids
    WHERE auction_id = NEW.auction_id
  )
  WHERE id = NEW.auction_id;

  RETURN NEW;
END;
$$;

-- Trigger: after insert on bids only, sync that auction's collected_amount
CREATE TRIGGER trg_sync_auction_collected_amount
  AFTER INSERT ON bids
  FOR EACH ROW
  EXECUTE FUNCTION sync_auction_collected_amount();

-- Backfill collected_amount for existing auctions
UPDATE auctions a
SET collected_amount = (
  SELECT COALESCE(SUM(b.amount), 0)
  FROM bids b
  WHERE b.auction_id = a.id
)
WHERE a.collected_amount IS DISTINCT FROM (
  SELECT COALESCE(SUM(b.amount), 0)
  FROM bids b
  WHERE b.auction_id = a.id
);
