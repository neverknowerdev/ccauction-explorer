/**
 * Handle TokensReceived event
 * - Update auction status to 'planned'
 */

import { eq, and } from 'drizzle-orm';
import { db, auctions } from '@/lib/db';
import type { EventContext } from '../types';
import { auctionNotFoundError } from '../errors';

export async function handleTokensReceived(ctx: EventContext): Promise<void> {
  const auctionAddress = ctx.contractAddress.toLowerCase();

  const result = await db
    .update(auctions)
    .set({
      status: 'planned',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(auctions.chainId, ctx.chainId),
        eq(auctions.address, auctionAddress)
      )
    )
    .returning({ id: auctions.id });

  if (result.length === 0) {
    throw auctionNotFoundError('TokensReceived', ctx.chainId, auctionAddress);
  }

  console.log(`TokensReceived: updated auction id=${result[0].id} status=planned`);
}
