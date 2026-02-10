/**
 * Handle BidSubmitted event
 * - Insert bid record with ON CONFLICT DO NOTHING
 * - Convert Q96 price to human-readable decimal
 * - Convert amount from raw currency units to human-readable decimal
 */

import { db, bids } from '@/lib/db';
import { getAuctionWithCurrency, getLatestEthPrice } from '@/lib/db';
import { q96ToPrice } from '@/utils/format';
import { getCurrencyDecimals, currencyAmountToHuman } from '@/lib/currencies';
import Decimal from 'decimal.js';
import type { EventContext } from '../types';
import { auctionNotFoundError, missingParamsError } from '../errors';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function toUsdAmount(amount: string, usdPrice: string): string {
  const result = new Decimal(amount).mul(new Decimal(usdPrice));
  return result.toFixed(18).replace(/\.?0+$/, '');
}

export async function handleBidSubmitted(ctx: EventContext): Promise<void> {
  const auctionAddress = ctx.contractAddress.toLowerCase();
  // BidSubmitted(uint256 indexed id, address indexed owner, uint256 price, uint128 amount)
  // - price: Q96 format (needs conversion)
  // - amount: raw currency units (e.g., USDC with 6 decimals)
  const bidId = (ctx.params.id as string) ?? (ctx.params.bidId as string) ?? (ctx.params[0] as string);
  const bidderAddress = ((ctx.params.owner as string) ?? (ctx.params.bidder as string) ?? (ctx.params[1] as string))?.toLowerCase();
  const priceQ96 = (ctx.params.price as string) ?? (ctx.params[2] as string);
  const rawAmount = (ctx.params.amount as string) ?? (ctx.params[3] as string);

  if (!bidId || !bidderAddress || !priceQ96 || !rawAmount) {
    throw missingParamsError('BidSubmitted', ctx.params);
  }

  const auction = await getAuctionWithCurrency(ctx.chainId, auctionAddress);
  if (!auction) {
    throw auctionNotFoundError('BidSubmitted', ctx.chainId, auctionAddress);
  }

  // Convert price from Q96 to human-readable decimal
  const tokenDecimals = auction.tokenInfo?.decimals ?? 18;
  const currencyDecimals = getCurrencyDecimals(auction.currency);
  const maxPrice = q96ToPrice(priceQ96, tokenDecimals, currencyDecimals);
  console.log('[BidSubmitted] priceQ96', priceQ96, 'maxPrice', maxPrice);

  // Convert amount from raw currency units to human-readable decimal
  const amount = currencyAmountToHuman(rawAmount, currencyDecimals);
  let amountUsd: string | null = null;

  if (auction.isCurrencyStablecoin) {
    amountUsd = amount;
  } else if (auction.currency?.toLowerCase() === ZERO_ADDRESS) {
    const latestEthPrice = await getLatestEthPrice();
    if (latestEthPrice == null) {
      throw new Error(
        'BidSubmitted: ETH price required for amount_usd but no record in eth_prices. Run scan-blocks (or cron eth-prices) first to fetch and store ETH price.'
      );
    }
    amountUsd = toUsdAmount(amount, latestEthPrice);
  }

  // Insert bid with ON CONFLICT DO NOTHING (composite PK: auction_id, bid_id)
  const inserted = await db
    .insert(bids)
    .values({
      auctionId: auction.id,
      bidId,
      address: bidderAddress,
      amount,
      amountUsd,
      maxPrice,
      status: 'open',
      time: ctx.timestamp,
      processedLogId: ctx.processedLogId,
    })
    .onConflictDoNothing()
    .returning({ auctionId: bids.auctionId, bidId: bids.bidId });

  if (inserted.length === 0) {
    console.log(`BidSubmitted: bid already exists (auctionId=${auction.id}, bidId=${bidId})`);
    return;
  }

  console.log(`BidSubmitted: created bid auctionId=${auction.id} bidId=${bidId} bidder=${bidderAddress}`);
}
