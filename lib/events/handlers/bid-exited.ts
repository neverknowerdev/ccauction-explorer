/**
 * Handle BidExited event
 * - Update bid status to 'cancelled'
 */

import { eq, and } from 'drizzle-orm';
import { db, bids } from '@/lib/db';
import { getAuctionId } from '@/lib/db';
import type { EventContext } from '../types';
import { auctionNotFoundError, bidNotFoundError, missingParamsError } from '../errors';

export async function handleBidExited(ctx: EventContext): Promise<void> {
  const auctionAddress = ctx.contractAddress.toLowerCase();
  // BidExited(uint256 indexed bidId, address indexed owner, uint256 tokensFilled, uint256 currencyRefunded)
  const bidId = (ctx.params.bidId as string) ?? (ctx.params[0] as string);

  if (!bidId) {
    throw missingParamsError('BidExited', ctx.params);
  }

  const auctionId = await getAuctionId(ctx.chainId, auctionAddress);
  if (!auctionId) {
    throw auctionNotFoundError('BidExited', ctx.chainId, auctionAddress);
  }

  const result = await db
    .update(bids)
    .set({
      status: 'cancelled',
    })
    .where(
      and(
        eq(bids.auctionId, auctionId),
        eq(bids.bidId, bidId)
      )
    )
    .returning({ bidId: bids.bidId });

  if (result.length === 0) {
    throw bidNotFoundError('BidExited', auctionId, bidId);
  }

  console.log(`BidExited: updated bid auctionId=${auctionId} bidId=${bidId} status=cancelled`);
}
