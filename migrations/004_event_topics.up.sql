-- Event topics: known event types we subscribe to (e.g. AuctionCreated, BidSubmitted).
-- topic0 = keccak256(signature); alchemy_signatures maps chainId -> Alchemy webhook signature/identifier.

CREATE TABLE event_topics (
  id                  bigserial   NOT NULL PRIMARY KEY,
  event_name          text        NOT NULL,
  topic0              text        NOT NULL UNIQUE,
  params              text,
  signature            text,
  alchemy_signatures   jsonb       NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_event_topics_topic0 ON event_topics (topic0);

-- Seed event_topics: CCA Factory, Uniswap Liquidity Strategy, and auction events.
-- alchemy_signatures: chain ID -> Alchemy webhook signature/identifier (1=Ethereum, 11155111=Ethereum Sepolia, 8453=Base Mainnet, 84532=Base Sepolia, 42161=Arbitrum One).

INSERT INTO event_topics (event_name, topic0, params, signature, alchemy_signatures) VALUES
-- CCA Factory AuctionCreated
(
  'AuctionCreated',
  '0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9',
  'address indexed auction, address indexed token, uint256 amount, bytes configData',
  'AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)',
  '{"1": "", "11155111": "", "8453": "", "84532": "", "42161": ""}'::jsonb
),
-- Uniswap Liquidity Strategy AuctionCreated
(
  'AuctionCreated',
  '0x8a8cc462d00726e0f8c031dd2d6b9dcdf0794fb27a88579830dadee27d43ea7c',
  'address indexed auction',
  'AuctionCreated(address indexed auction)',
  '{"1": "", "11155111": "", "8453": "", "84532": "", "42161": ""}'::jsonb
),
-- Auction events
(
  'TokensReceived',
  '0x17cca138a663106b4c25a247e2d9238888fe37188d83b7bb7287bc1c0a4df82a',
  'uint256 totalSupply',
  'TokensReceived(uint256 totalSupply)',
  '{"1": "", "11155111": "", "8453": "", "84532": "", "42161": ""}'::jsonb
),
(
  'BidSubmitted',
  '0x650baad5cd8ca09b8f580be220fa04ce2ba905a041f764b6a3fe2c848eb70540',
  'uint256 indexed id, address indexed owner, uint256 price, uint128 amount',
  'BidSubmitted(uint256 indexed id, address indexed owner, uint256 price, uint128 amount)',
  '{"1": "", "11155111": "", "8453": "", "84532": "", "42161": ""}'::jsonb
),
(
  'BidExited',
  '0x054fe6469466a0b4d2a6ae4b100e5f9c494c958f04b4000f44d470088dd97930',
  'uint256 indexed bidId, address indexed owner, uint256 tokensFilled, uint256 currencyRefunded',
  'BidExited(uint256 indexed bidId, address indexed owner, uint256 tokensFilled, uint256 currencyRefunded)',
  '{"1": "", "11155111": "", "8453": "", "84532": "", "42161": ""}'::jsonb
),
(
  'TokensClaimed',
  '0x880f2ef2613b092f1a0a819f294155c98667eb294b7e6bf7a3810278142c1a1c',
  'uint256 indexed bidId, address indexed owner, uint256 tokensFilled',
  'TokensClaimed(uint256 indexed bidId, address indexed owner, uint256 tokensFilled)',
  '{"1": "", "11155111": "", "8453": "", "84532": "", "42161": ""}'::jsonb
),
(
  'ClearingPriceUpdated',
  '0x30adbe996d7a69a21fdebcc1f8a46270bf6c22d505a7d872c1ab4767aa707609',
  'uint256 blockNumber, uint256 clearingPrice',
  'ClearingPriceUpdated(uint256 blockNumber, uint256 clearingPrice)',
  '{"1": "", "11155111": "", "8453": "", "84532": "", "42161": ""}'::jsonb
);
