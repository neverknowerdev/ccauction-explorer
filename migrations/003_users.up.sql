-- Users table: one row per user keyed by primary_wallet.
-- Stores Farcaster/social, platform, and denormalized bid_ids cache.

CREATE TABLE users (
  id              uuid          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  primary_wallet   text          NOT NULL UNIQUE,
  wallets         text[]        NOT NULL DEFAULT '{}',
  farcaster_fid   bigint,
  farcaster_username text,
  email           text,
  platform        user_platform,
  bid_ids         integer[]     NOT NULL DEFAULT '{}',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_farcaster_fid ON users (farcaster_fid) WHERE farcaster_fid IS NOT NULL;
CREATE INDEX idx_users_primary_wallet ON users (primary_wallet);
CREATE INDEX idx_users_email ON users (email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_wallets ON users USING GIN (wallets);
