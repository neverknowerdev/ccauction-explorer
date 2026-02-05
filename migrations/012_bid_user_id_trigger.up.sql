-- Before insert on bids: set user_id from address lookup (primary_wallet or wallets)
CREATE OR REPLACE FUNCTION set_bid_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT id INTO NEW.user_id
  FROM users
  WHERE primary_wallet = NEW.address OR NEW.address = ANY(wallets)
  LIMIT 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_bid_user_id
  BEFORE INSERT ON bids
  FOR EACH ROW
  EXECUTE FUNCTION set_bid_user_id();
