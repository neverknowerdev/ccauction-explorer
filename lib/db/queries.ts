/**
 * Database query utilities
 */

import { eq, and, desc, max, sql } from 'drizzle-orm';
import { db } from './index';
import {
  auctions,
  bids,
  chains,
  ethPrices,
  processedLogs,
  processedLogsErrors,
  logScans,
  eventTopics,
} from './schema';
import type { EventTopic } from './schema';

/**
 * Get the highest block number in processed_logs for a chain.
 * Returns null if no logs processed yet for this chain.
 */
export async function getLatestProcessedBlock(chainId: number): Promise<number | null> {
  const result = await db
    .select({ maxBlock: max(processedLogs.blockNumber) })
    .from(processedLogs)
    .where(eq(processedLogs.chainId, chainId))
    .limit(1);

  const val = result[0]?.maxBlock;
  return val != null ? Number(val) : null;
}

/**
 * Get auction ID by chain and address, returns null if not found
 */
export async function getAuctionId(
  chainId: number,
  auctionAddress: string
): Promise<number | null> {
  const result = await db
    .select({ id: auctions.id })
    .from(auctions)
    .where(
      and(
        eq(auctions.chainId, chainId),
        eq(auctions.address, auctionAddress.toLowerCase())
      )
    )
    .limit(1);

  return result.length > 0 ? result[0].id : null;
}

/**
 * Get auction ID and currency by chain and address, returns null if not found
 */
export async function getAuctionWithCurrency(
  chainId: number,
  auctionAddress: string
): Promise<{ id: number; currency: string | null; isCurrencyStablecoin: boolean | null } | null> {
  const result = await db
    .select({
      id: auctions.id,
      currency: auctions.currency,
      isCurrencyStablecoin: auctions.isCurrencyStablecoin,
    })
    .from(auctions)
    .where(
      and(
        eq(auctions.chainId, chainId),
        eq(auctions.address, auctionAddress.toLowerCase())
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/** Token info stored in auctions.token_info jsonb */
export type AuctionTokenInfoJson = {
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  icon?: string | null;
  logo?: string | null;
  description?: string | null;
  categories?: string[] | null;
} | null;

/** Link map stored in auctions.links jsonb */
export type AuctionLinksJson = Record<string, string> | null;

/**
 * Get auction ID and token (with decimals) by chain and address for TokensClaimed.
 * tokensFilled in the event is in token units, so we need token decimals to convert.
 */
export async function getAuctionWithToken(
  chainId: number,
  auctionAddress: string
): Promise<{ id: number; tokenInfo: AuctionTokenInfoJson } | null> {
  const result = await db
    .select({ id: auctions.id, tokenInfo: auctions.tokenInfo })
    .from(auctions)
    .where(
      and(
        eq(auctions.chainId, chainId),
        eq(auctions.address, auctionAddress.toLowerCase())
      )
    )
    .limit(1);

  if (result.length === 0) return null;
  const row = result[0];
  return { id: row.id, tokenInfo: row.tokenInfo as AuctionTokenInfoJson };
}

/**
 * Get all event topics (for log decoding and scanning).
 */
export async function getEventTopics(): Promise<EventTopic[]> {
  return db.select().from(eventTopics);
}

export async function getLatestEthPrice(): Promise<string | null> {
  const result = await db
    .select({ price: ethPrices.price })
    .from(ethPrices)
    .orderBy(desc(ethPrices.timestamp))
    .limit(1);

  return result.length > 0 ? (result[0].price as string) : null;
}

// =============================================================================
// LOG SCANS
// =============================================================================

/**
 * Get the latest scanned block for a chain from the cron scan tracking table.
 * Returns null if no scan has been recorded yet.
 */
export async function getLatestScannedBlock(chainId: number): Promise<number | null> {
  const result = await db
    .select({ latestScannedBlock: logScans.latestScannedBlock })
    .from(logScans)
    .where(eq(logScans.chainId, chainId))
    .limit(1);

  return result.length > 0 ? result[0].latestScannedBlock : null;
}

/**
 * Update the latest scanned block for a chain (upsert).
 */
export async function updateLatestScannedBlock(chainId: number, blockNumber: number): Promise<void> {
  await db
    .insert(logScans)
    .values({
      chainId,
      latestScannedBlock: blockNumber,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: logScans.chainId,
      set: {
        latestScannedBlock: blockNumber,
        updatedAt: new Date(),
      },
    });
}

// =============================================================================
// AUCTION NOT FOUND ERRORS
// =============================================================================

/**
 * Get distinct auction addresses from "auction not found" errors.
 * Returns array of { chainId, contractAddress }.
 */
export async function getAuctionNotFoundAddresses(): Promise<
  { chainId: number; contractAddress: string }[]
> {
  const result = await db
    .selectDistinct({
      chainId: processedLogs.chainId,
      contractAddress: processedLogs.contractAddress,
    })
    .from(processedLogsErrors)
    .innerJoin(processedLogs, eq(processedLogsErrors.processedLogId, processedLogs.id))
    .where(eq(processedLogsErrors.errorType, 'AUCTION_NOT_FOUND'));

  // Filter out nulls and return
  return result
    .filter((r): r is { chainId: number; contractAddress: string } => r.contractAddress != null)
    .map(r => ({
      chainId: r.chainId,
      contractAddress: r.contractAddress.toLowerCase(),
    }));
}

// =============================================================================
// AUCTIONS (API)
// =============================================================================

export async function listAuctions(limit = 50) {
  return db
    .select({
      id: auctions.id,
      chainId: auctions.chainId,
      chainName: chains.name,
      status: auctions.status,
      startTime: auctions.startTime,
      endTime: auctions.endTime,
      tokenInfo: auctions.tokenInfo,
      links: auctions.links,
      currency: auctions.currency,
      currencyName: auctions.currencyName,
      currentClearingPrice: auctions.currentClearingPrice,
      collectedAmount: auctions.collectedAmount,
      targetAmount: auctions.targetAmount,
      floorPrice: auctions.floorPrice,
      extraFundsDestination: auctions.extraFundsDestination,
      supplyInfo: auctions.supplyInfo,
      bidsCount: sql<number>`(select count(*) from ${bids} where ${bids.auctionId} = ${auctions.id})`,
    })
    .from(auctions)
    .leftJoin(chains, eq(auctions.chainId, chains.id))
    .orderBy(desc(auctions.updatedAt))
    .limit(limit);
}

export async function getAuctionById(auctionId: number) {
  const result = await db
    .select({
      id: auctions.id,
      chainId: auctions.chainId,
      chainName: chains.name,
      status: auctions.status,
      startTime: auctions.startTime,
      endTime: auctions.endTime,
      tokenInfo: auctions.tokenInfo,
      links: auctions.links,
      currency: auctions.currency,
      currencyName: auctions.currencyName,
      currentClearingPrice: auctions.currentClearingPrice,
      collectedAmount: auctions.collectedAmount,
      targetAmount: auctions.targetAmount,
      floorPrice: auctions.floorPrice,
      extraFundsDestination: auctions.extraFundsDestination,
      supplyInfo: auctions.supplyInfo,
      factoryAddress: auctions.factoryAddress,
      validationHookAddress: auctions.validationHookAddress,
      auctionStepsRaw: auctions.auctionStepsRaw,
    })
    .from(auctions)
    .leftJoin(chains, eq(auctions.chainId, chains.id))
    .where(eq(auctions.id, auctionId))
    .limit(1);

  return result[0] ?? null;
}

export async function listBidsForAuction(auctionId: number) {
  return db
    .select({
      bidId: bids.bidId,
      amount: bids.amount,
      amountUsd: bids.amountUsd,
      maxPrice: bids.maxPrice,
      status: bids.status,
      time: bids.time,
      filledTokens: bids.filledTokens,
    })
    .from(bids)
    .where(eq(bids.auctionId, auctionId))
    .orderBy(desc(bids.maxPrice));
}

export async function listBidsForAuctionByAddress(
  auctionId: number,
  bidderAddress: string
) {
  return db
    .select({
      bidId: bids.bidId,
      amount: bids.amount,
      amountUsd: bids.amountUsd,
      maxPrice: bids.maxPrice,
      status: bids.status,
      time: bids.time,
      filledTokens: bids.filledTokens,
    })
    .from(bids)
    .where(
      and(
        eq(bids.auctionId, auctionId),
        eq(bids.address, bidderAddress.toLowerCase())
      )
    )
    .orderBy(desc(bids.maxPrice));
}

export async function countBidsForAuction(auctionId: number): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(bids)
    .where(eq(bids.auctionId, auctionId))
    .limit(1);

  return Number(result[0]?.count ?? 0);
}
