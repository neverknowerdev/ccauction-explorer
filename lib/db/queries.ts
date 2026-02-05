/**
 * Database query utilities
 */

import { eq, and, max, sql } from 'drizzle-orm';
import { db } from './index';
import {
  auctions,
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
): Promise<{ id: number; currency: string | null } | null> {
  const result = await db
    .select({ id: auctions.id, currency: auctions.currency })
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

/** Token info stored in auctions.token jsonb */
export type AuctionTokenJson = {
  address?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
} | null;

/**
 * Get auction ID and token (with decimals) by chain and address for TokensClaimed.
 * tokensFilled in the event is in token units, so we need token decimals to convert.
 */
export async function getAuctionWithToken(
  chainId: number,
  auctionAddress: string
): Promise<{ id: number; token: AuctionTokenJson } | null> {
  const result = await db
    .select({ id: auctions.id, token: auctions.token })
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
  return { id: row.id, token: row.token as AuctionTokenJson };
}

/**
 * Get all event topics (for log decoding and scanning).
 */
export async function getEventTopics(): Promise<EventTopic[]> {
  return db.select().from(eventTopics);
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
