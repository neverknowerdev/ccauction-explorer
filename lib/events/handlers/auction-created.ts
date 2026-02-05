/**
 * Handle AuctionCreated event
 * - Create new auction in DB with status='created'
 * - Fetch full auction info from creation tx, source code hash, and update DB
 */

import { eq } from 'drizzle-orm';
import { db, auctions } from '@/lib/db';
import {
  fetchAuctionInfoFromTx,
  getContractSourceCodeHash,
  isChainSupported,
} from '@/lib/auction';
import type { AuctionInfo } from '@/lib/auction/fetcher';
import { getCurrencyName, getCurrencyDecimals, currencyAmountToHuman } from '@/lib/currencies';
import { q96ToHuman } from '@/utils/format';
import type { EventContext } from '../types';
import { missingParamsError } from '../errors';

function buildTokenJson(info: AuctionInfo) {
  return {
    address: info.tokenAddress,
    name: info.tokenName,
    symbol: info.tokenSymbol,
    decimals: info.tokenDecimals,
    totalSupply: info.tokenTotalSupply.toString(),
  };
}

function buildSupplyInfoJson(info: AuctionInfo) {
  return {
    totalSupply: info.tokenSupplyInfo.totalSupply.toString(),
    totalDistributed: info.tokenSupplyInfo.totalDistributed.toString(),
    auctionAmount: info.tokenSupplyInfo.auctionAmount.toString(),
    poolAmount: info.tokenSupplyInfo.poolAmount.toString(),
    ownerRetained: info.tokenSupplyInfo.ownerRetained.toString(),
    auctionPercent: info.tokenSupplyInfo.auctionPercent,
    poolPercent: info.tokenSupplyInfo.poolPercent,
    ownerPercent: info.tokenSupplyInfo.ownerPercent,
    tokenMintInfo: info.tokenMintInfo,
  };
}

export async function handleAuctionCreated(ctx: EventContext): Promise<void> {
  // AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)
  const auctionAddress = (
    (ctx.params.auction as string) ??
    (ctx.params[0] as string)
  )?.toLowerCase();
  const tokenAddress = (
    (ctx.params.token as string) ??
    (ctx.params[1] as string)
  )?.toLowerCase();

  if (!auctionAddress) {
    throw missingParamsError('AuctionCreated', ctx.params);
  }

  // Insert auction with ON CONFLICT DO NOTHING
  const inserted = await db
    .insert(auctions)
    .values({
      chainId: ctx.chainId,
      address: auctionAddress,
      status: 'created',
      token: tokenAddress ? { address: tokenAddress } : null,
      processedLogId: ctx.processedLogId,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    })
    .onConflictDoNothing({
      target: [auctions.chainId, auctions.address],
    })
    .returning({ id: auctions.id });

  if (inserted.length === 0) {
    console.log(`AuctionCreated: auction already exists (chain=${ctx.chainId}, address=${auctionAddress})`);
    return;
  }

  const auctionId = inserted[0].id;
  console.log(`AuctionCreated: created auction id=${auctionId} address=${auctionAddress}`);

  if (!isChainSupported(ctx.chainId)) return;

  try {
    const info = await fetchAuctionInfoFromTx(ctx.transactionHash as `0x${string}`, ctx.chainId);
    const tokenJson = buildTokenJson(info);
    const supplyInfoJson = buildSupplyInfoJson(info);

    let sourceCodeHash: string | null = null;
    try {
      sourceCodeHash = await getContractSourceCodeHash(auctionAddress as `0x${string}`, ctx.chainId);
    } catch (err) {
      console.warn(`AuctionCreated: could not get source code hash for ${auctionAddress}:`, err);
    }

    // Convert targetAmount from raw currency units to human-readable decimal
    // Use requiredCurrencyRaised which is the currency target, not auctionAmount (which is token quantity)
    const currencyDecimals = getCurrencyDecimals(info.parameters.currency);
    const targetAmount = currencyAmountToHuman(info.parameters.requiredCurrencyRaised, currencyDecimals);

    // Convert auctionAmount (token quantity) using token decimals
    const auctionTokenSupply = currencyAmountToHuman(info.auctionAmount, info.tokenDecimals);

    await db
      .update(auctions)
      .set({
        status: info.auctionStatus,
        creatorAddress: info.from,
        startTime: info.timeInfo.startTime,
        endTime: info.timeInfo.endTime,
        floorPrice: q96ToHuman(info.parameters.floorPrice),
        currentClearingPrice: null, // can be filled by later events
        targetAmount,
        auctionTokenSupply,
        currency: info.parameters.currency,
        currencyName: getCurrencyName(info.parameters.currency),
        token: tokenJson,
        supplyInfo: supplyInfoJson,
        extraFundsDestination: info.extraFundsDestination,
        sourceCodeHash,
        updatedAt: new Date(),
      })
      .where(eq(auctions.id, auctionId));

    console.log(`AuctionCreated: updated auction id=${auctionId} with full info${sourceCodeHash ? ' and source_code_hash' : ''}`);
  } catch (error) {
    console.error(`AuctionCreated: failed to fetch auction info for ${auctionAddress}:`, error);
  }
}
