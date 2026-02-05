-- Chains: supported networks (id = chainId).
-- Run before auctions and processed_logs (they reference chains.id).

CREATE TABLE chains (
  id          integer  NOT NULL PRIMARY KEY,
  name        text     NOT NULL,
  title       text     NOT NULL,
  is_testnet  boolean  NOT NULL DEFAULT false,
  is_active   boolean  NOT NULL DEFAULT true
);

INSERT INTO chains (id, name, title, is_testnet, is_active) VALUES
  (1,         'ethereum',        'Ethereum Mainnet',  false, true),
  (11155111,  'ethereum_sepolia','Ethereum Sepolia',  true,  true),
  (8453,      'base',            'Base Mainnet',      false, true),
  (84532,     'base_sepolia',    'Base Sepolia',      true,  true),
  (42161,     'arbitrum',        'Arbitrum One',      false, true);
