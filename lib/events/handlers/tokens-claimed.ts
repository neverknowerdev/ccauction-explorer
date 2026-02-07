/**
 * Handle TokensClaimed event
 * - Update bid status to 'claimed' and set filled_tokens
 *
 * tokensFilled in the event is the number of TOKENS the bidder received (raw token units),
 * so we convert using the auction token's decimals (typically 18), not currency decimals.
 */

import { eq, and } from 'drizzle-orm';
import { db, bids } from '@/lib/db';
import { getAuctionWithToken } from '@/lib/db';
import { tokenAmountToHuman } from '@/utils/format';
import type { EventContext } from '../types';
import { auctionNotFoundError, bidNotFoundError, missingParamsError } from '../errors';

export async function handleTokensClaimed(ctx: EventContext): Promise<void> {
  const auctionAddress = ctx.contractAddress.toLowerCase();
  // TokensClaimed(uint256 indexed bidId, address indexed owner, uint256 tokensFilled)
  const bidId = (ctx.params.bidId as string) ?? (ctx.params[0] as string);
  const rawFilledTokens = (ctx.params.tokensFilled as string) ?? (ctx.params.amount as string) ?? (ctx.params[2] as string);

  if (!bidId) {
    throw missingParamsError('TokensClaimed', ctx.params);
  }

  const auction = await getAuctionWithToken(ctx.chainId, auctionAddress);
  if (!auction) {
    throw auctionNotFoundError('TokensClaimed', ctx.chainId, auctionAddress);
  }

  // Convert filledTokens from raw token units to human-readable decimal (tokens received)
  const tokenDecimals = auction.tokenInfo?.decimals ?? 18;
  let filledTokens: string | null = null;
  if (rawFilledTokens) {
    filledTokens = tokenAmountToHuman(rawFilledTokens, tokenDecimals);
  }

  const result = await db
    .update(bids)
    .set({
      status: 'claimed',
      filledTokens,
    })
    .where(
      and(
        eq(bids.auctionId, auction.id),
        eq(bids.bidId, bidId)
      )
    )
    .returning({ bidId: bids.bidId });

  if (result.length === 0) {
    throw bidNotFoundError('TokensClaimed', auction.id, bidId);
  }

  console.log(`TokensClaimed: updated bid auctionId=${auction.id} bidId=${bidId} status=claimed filledTokens=${filledTokens}`);
}
