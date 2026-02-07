-- Function: increment auction collected_amount and collected_amount_usd by the new bid; set above_test_threshold when collected_amount_usd >= 20 (on insert)
CREATE OR REPLACE FUNCTION sync_auction_collected_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE auctions
  SET
    collected_amount = COALESCE(collected_amount, 0) + NEW.amount,
    collected_amount_usd = COALESCE(collected_amount_usd, 0) + COALESCE(NEW.amount_usd, 0),
    above_test_threshold = above_test_threshold OR ((COALESCE(collected_amount_usd, 0) + COALESCE(NEW.amount_usd, 0)) >= 20)
  WHERE id = NEW.auction_id;

  RETURN NEW;
END;
$$;

-- Trigger: after insert on bids only, sync that auction's collected_amount
CREATE TRIGGER trg_sync_auction_collected_amount
  AFTER INSERT ON bids
  FOR EACH ROW
  EXECUTE FUNCTION sync_auction_collected_amount();

-- Backfill collected_amount, collected_amount_usd, and above_test_threshold for existing auctions (one-time from sum of bids)
UPDATE auctions a
SET
  collected_amount = s.sum_amount,
  collected_amount_usd = s.sum_usd,
  above_test_threshold = (s.sum_usd >= 20)
FROM (
  SELECT
    b.auction_id,
    COALESCE(SUM(b.amount), 0) AS sum_amount,
    COALESCE(SUM(b.amount_usd), 0)::numeric AS sum_usd
  FROM bids b
  GROUP BY b.auction_id
) s
WHERE a.id = s.auction_id
  AND (
    a.collected_amount IS DISTINCT FROM s.sum_amount
    OR a.collected_amount_usd IS DISTINCT FROM s.sum_usd
    OR a.above_test_threshold IS DISTINCT FROM (s.sum_usd >= 20)
  );
