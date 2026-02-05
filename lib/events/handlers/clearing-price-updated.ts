/**
 * Handle ClearingPriceUpdated event
 * - Insert clearing price history record
 * - Update auction's current clearing price
 */

import { eq } from 'drizzle-orm';
import { db, auctions, clearingPriceHistory } from '@/lib/db';
import { getAuctionId } from '@/lib/db';
import { q96ToHuman } from '@/utils/format';
import type { EventContext } from '../types';
import { auctionNotFoundError, missingParamsError } from '../errors';

export async function handleClearingPriceUpdated(ctx: EventContext): Promise<void> {
  const auctionAddress = ctx.contractAddress.toLowerCase();
  // Decoded args from ClearingPriceUpdated(uint256,uint256) are positional: 0=blockNumber, 1=clearingPrice (Q96)
  const clearingPriceRaw =
    (ctx.params.clearingPrice as string) ??
    (ctx.params.param1 as string) ??
    (ctx.params[1] as string) ??
    (ctx.params['1'] as string);

  if (!clearingPriceRaw) {
    throw missingParamsError('ClearingPriceUpdated', ctx.params);
  }


  const clearingPrice = q96ToHuman(clearingPriceRaw);
  console.log('[ClearingPriceUpdated] clearingPriceRaw', clearingPriceRaw, 'clearingPrice', clearingPrice);

  const auctionId = await getAuctionId(ctx.chainId, auctionAddress);
  if (!auctionId) {
    throw auctionNotFoundError('ClearingPriceUpdated', ctx.chainId, auctionAddress);
  }

  // Insert clearing price history (always insert, no conflict handling needed since id is autoincrement)
  await db.insert(clearingPriceHistory).values({
    auctionId,
    time: ctx.timestamp,
    clearingPrice,
    processedLogId: ctx.processedLogId,
  });

  // Update auction's current clearing price
  await db
    .update(auctions)
    .set({
      currentClearingPrice: clearingPrice,
      updatedAt: new Date(),
    })
    .where(eq(auctions.id, auctionId));

  console.log(`ClearingPriceUpdated: recorded for auctionId=${auctionId} price=${clearingPrice}`);
}
