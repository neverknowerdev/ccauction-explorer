/**
 * Event handlers - dispatcher and re-exports
 */

import { EVENT_NAMES } from '../types';
import type { EventContext } from '../types';
import { handleAuctionCreated } from './auction-created';
import { handleTokensReceived } from './tokens-received';
import { handleBidSubmitted } from './bid-submitted';
import { handleBidExited } from './bid-exited';
import { handleTokensClaimed } from './tokens-claimed';
import { handleClearingPriceUpdated } from './clearing-price-updated';

export { EVENT_NAMES };
export { handleAuctionCreated } from './auction-created';
export { handleTokensReceived } from './tokens-received';
export { handleBidSubmitted } from './bid-submitted';
export { handleBidExited } from './bid-exited';
export { handleTokensClaimed } from './tokens-claimed';
export { handleClearingPriceUpdated } from './clearing-price-updated';

/**
 * Process an event based on its name
 */
export async function processEvent(
  eventName: string,
  ctx: EventContext
): Promise<void> {
  switch (eventName) {
    case EVENT_NAMES.AUCTION_CREATED:
      await handleAuctionCreated(ctx);
      break;
    case EVENT_NAMES.TOKENS_RECEIVED:
      await handleTokensReceived(ctx);
      break;
    case EVENT_NAMES.BID_SUBMITTED:
      await handleBidSubmitted(ctx);
      break;
    case EVENT_NAMES.BID_EXITED:
      await handleBidExited(ctx);
      break;
    case EVENT_NAMES.TOKENS_CLAIMED:
      await handleTokensClaimed(ctx);
      break;
    case EVENT_NAMES.CLEARING_PRICE_UPDATED:
      await handleClearingPriceUpdated(ctx);
      break;
    default:
      console.log(`Unknown event: ${eventName}`);
  }
}
