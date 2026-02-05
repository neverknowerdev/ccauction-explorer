/**
 * Shared types for event handlers
 */

export const EVENT_NAMES = {
  AUCTION_CREATED: 'AuctionCreated',
  TOKENS_RECEIVED: 'TokensReceived',
  BID_SUBMITTED: 'BidSubmitted',
  BID_EXITED: 'BidExited',
  TOKENS_CLAIMED: 'TokensClaimed',
  CLEARING_PRICE_UPDATED: 'ClearingPriceUpdated',
} as const;

export interface EventContext {
  chainId: number;
  blockNumber: number;
  transactionHash: string;
  contractAddress: string; // auction address
  params: Record<string, unknown>;
  timestamp: Date;
  processedLogId: number;
}
