-- Remove trigger and function
DROP TRIGGER IF EXISTS trg_sync_auction_collected_amount ON bids;
DROP FUNCTION IF EXISTS sync_auction_collected_amount();
