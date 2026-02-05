-- Enums used by users, auctions, and bids tables.
-- Run first before any table that references these types.

CREATE TYPE auction_status AS ENUM (
  'created',
  'planned',
  'active',
  'graduated',
  'claimable',
  'ended'
);

CREATE TYPE extra_funds_destination AS ENUM (
  'pool',
  'creator'
);

CREATE TYPE bid_status AS ENUM (
  'open',
  'closed',
  'filled',
  'partially_filled',
  'cancelled',
  'claimed'
);

CREATE TYPE user_platform AS ENUM (
  'farcaster_miniapp',
  'baseapp_miniapp',
  'webapp'
);

-- Event processing error types (must match lib/events/errors.ts EventErrorType)
CREATE TYPE event_error_type AS ENUM (
  'AUCTION_NOT_FOUND',
  'AUCTION_MISSING_PARAMS',
  'BID_NOT_FOUND',
  'BID_MISSING_PARAMS',
  'MISSING_PARAMS',
  'DECODE_ERROR',
  'DB_ERROR',
  'UNKNOWN_ERROR'
);
