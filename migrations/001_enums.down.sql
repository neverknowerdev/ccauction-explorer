-- Rollback enums (tables using them are dropped by later down migrations).

DROP TYPE IF EXISTS event_error_type CASCADE;
DROP TYPE IF EXISTS user_platform CASCADE;
DROP TYPE IF EXISTS bid_status CASCADE;
DROP TYPE IF EXISTS extra_funds_destination CASCADE;
DROP TYPE IF EXISTS auction_status CASCADE;
