export type AuctionStatus = 'created' | 'planned' | 'active' | 'graduated' | 'claimable' | 'ended';

export type AuctionStats = {
  total: number;
  totalIncludingTest: number;
  active: number;
  ended: number;
};

export type AuctionListItem = {
  id: number;
  chainId: number;
  chainName: string | null;
  tokenTicker: string | null;
  tokenName: string | null;
  tokenImage: string | null;
  status: AuctionStatus;
  startTime: string | null;
  endTime: string | null;
  currentPrice: number | null;
  raised: number | null;
  target: number | null;
  bidders: number;
  currency: string | null;
};

export type AuctionSupplyInfo = {
  totalSupply: number;
  auctionSupply: number;
  poolSupply: number;
  creatorRetained: number;
};

export type AuctionBid = {
  id: string;
  maxPrice: number | null;
  amount: number | null;
  amountUsd: number | null;
  filledPercent: number;
  isUserBid: boolean;
};

export type AuctionDetail = AuctionListItem & {
  address: string;
  currencyAddress: string | null;
  currencyDecimals: number;
  tokenDescription: string | null;
  tokenWebsite: string | null;
  tokenDecimals: number | null;
  supplyInfo: AuctionSupplyInfo | null;
  floorPrice: number | null;
  currentClearingPrice: number | null;
  maxBidPrice: number | null;
  extraFundsDestination: 'pool' | 'creator' | null;
  bids: AuctionBid[];
};
