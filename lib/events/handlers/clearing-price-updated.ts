/**
 * Handle ClearingPriceUpdated event
 * - Insert clearing price history record
 * - Update auction's current clearing price
 */

import { eq } from 'drizzle-orm';
import { db, auctions, clearingPriceHistory } from '@/lib/db';
import { getAuctionWithCurrency } from '@/lib/db';
import { getCurrencyDecimals } from '@/lib/currencies';
import { q96ToPrice } from '@/utils/format';
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

  const auction = await getAuctionWithCurrency(ctx.chainId, auctionAddress);
  if (!auction) {
    throw auctionNotFoundError('ClearingPriceUpdated', ctx.chainId, auctionAddress);
  }
  const tokenDecimals = auction.tokenInfo?.decimals ?? 18;
  const currencyDecimals = getCurrencyDecimals(auction.currency);
  const clearingPrice = q96ToPrice(clearingPriceRaw, tokenDecimals, currencyDecimals);
  console.log('[ClearingPriceUpdated] clearingPriceRaw', clearingPriceRaw, 'clearingPrice', clearingPrice);

  // Insert clearing price history (always insert, no conflict handling needed since id is autoincrement)
  await db.insert(clearingPriceHistory).values({
    auctionId: auction.id,
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
    .where(eq(auctions.id, auction.id));

  console.log(`ClearingPriceUpdated: recorded for auctionId=${auction.id} price=${clearingPrice}`);
}
