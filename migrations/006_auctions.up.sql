-- Auctions table: CCA contract per (chain_id, address).
-- Token and supply in jsonb. Amount and price fields = human-readable decimals (numeric with decimals).

CREATE TABLE auctions (
  id                       bigserial                 NOT NULL PRIMARY KEY,
  chain_id                 integer                   NOT NULL REFERENCES chains (id),
  address                  text                      NOT NULL,
  start_time               timestamptz,
  end_time                 timestamptz,
  status                   auction_status           NOT NULL DEFAULT 'created',
  creator_address          text,
  safety_checkups          jsonb                     NOT NULL DEFAULT '{}',
  token                    jsonb,
  currency                 text,
  currency_name            text,
  target_amount            numeric(30,18),
  auction_token_supply     numeric(30,18),
  collected_amount         numeric(30,18),
  floor_price              numeric(30,18),
  current_clearing_price   numeric(30,18),
  extra_funds_destination  extra_funds_destination,
  supply_info              jsonb,
  processed_log_id         bigint                    REFERENCES processed_logs (id),
  source_code_hash         text,
  created_at               timestamptz               NOT NULL DEFAULT now(),
  updated_at               timestamptz               NOT NULL DEFAULT now(),
  UNIQUE (chain_id, address)
);

CREATE UNIQUE INDEX idx_auctions_address ON auctions (address);
CREATE INDEX idx_auctions_token_address ON auctions ((token->>'address')) WHERE token IS NOT NULL AND token->>'address' IS NOT NULL;
CREATE INDEX idx_auctions_processed_log_id ON auctions (processed_log_id);
