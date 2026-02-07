/**
 * Cron Job: Scan Events
 *
 * This endpoint is called by Vercel Cron every hour to:
 * 1. Scan all chains for new events since last scan
 * 2. Update the latest scanned block in database
 *
 * Environment variables:
 *   CRON_SECRET - Secret to verify cron requests (optional but recommended)
 *   ALCHEMY_API_KEY - Alchemy API key for RPC access
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Hex } from 'viem';
import { eq } from 'drizzle-orm';
import {
  db,
  chains,
  ethPrices,
  getLatestScannedBlock,
  updateLatestScannedBlock,
} from '@/lib/db';
import { getDefaultStartBlock } from '@/lib/chains';
import {
  scanBlocks,
  getCachedEventTopics,
} from '@/lib/log-processing';
import { createAlchemyClient, getEthUsdPrice } from '@/lib/providers';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Maximum runtime for Vercel serverless function (leave buffer for response) */
const MAX_RUNTIME_MS = 50_000; // 50 seconds (Vercel Pro limit is 60s)

/** Batch size for block scanning */
const SCAN_BATCH_SIZE = 2000;

// =============================================================================
// CRON HANDLER
// =============================================================================

export const maxDuration = 60; // Vercel Pro allows up to 60s

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  console.log('Cron: Scanning events');

  // Optional: Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results = {
    chainsProcessed: 0,
    totalBlocksScanned: 0,
    totalEventsProcessed: 0,
    totalErrors: 0,
    timedOut: false,
    errors: [] as string[],
  };

  try {
    // =========================================================================
    // STEP 0: Fetch current ETH price and store (so bid amount_usd can use it during this run)
    // =========================================================================
    try {
      const priceUsd = await getEthUsdPrice();
      if (priceUsd != null && Number.isFinite(priceUsd)) {
        console.log('Cron: Inserting ETH price', priceUsd);
        await db.insert(ethPrices).values({
          timestamp: new Date(),
          price: priceUsd.toString(),
        });
        console.log(`Cron: Stored ETH price $${priceUsd}`);
      }
    } catch (priceErr) {
      console.warn('Cron: Could not fetch/store ETH price:', priceErr instanceof Error ? priceErr.message : priceErr);
    }

    // =========================================================================
    // STEP 1: Scan all chains for new events
    // =========================================================================
    {
      console.log('\n' + '='.repeat(60));
      console.log('Cron: Scanning chains for new events');
      console.log('='.repeat(60));

      // Get active chains from DB
      const activeChains = await db
        .select({ id: chains.id })
        .from(chains)
        .where(eq(chains.isActive, true));

      const activeChainIds = activeChains.map(c => c.id);
      console.log(`Active chains: ${activeChainIds.join(', ')}`);

      // Get event topics for filtering
      const knownEventTopics = await getCachedEventTopics();
      const topics = knownEventTopics.map(t => t.topic0 as Hex);

      for (const chainId of activeChainIds) {
        // Check if we're running out of time
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          console.log('Approaching timeout, stopping chain scanning');
          results.timedOut = true;
          break;
        }

        try {
          // Get start block: from DB or use default
          const lastScannedBlock = await getLatestScannedBlock(chainId);
          let startBlock: number;

          if (lastScannedBlock != null) {
            // Start from last scanned block (re-scan to catch any missed events)
            startBlock = lastScannedBlock;
            console.log(`\nChain ${chainId}: resuming from block ${startBlock}`);
          } else {
            // First scan - use default start block
            const defaultStart = getDefaultStartBlock(chainId);
            if (defaultStart == null) {
              console.warn(`Chain ${chainId}: no default start block configured, skipping`);
              continue;
            }
            startBlock = defaultStart;
            console.log(`\nChain ${chainId}: first scan from default block ${startBlock}`);
          }

          // Create client and get latest block
          let client;
          try {
            client = createAlchemyClient(chainId);
          } catch {
            console.warn(`Chain ${chainId}: not supported by Alchemy, skipping`);
            continue;
          }

          const latestBlockNumber = Number(await client.getBlockNumber());
          console.log(`Chain ${chainId}: latest block ${latestBlockNumber}`);

          if (startBlock >= latestBlockNumber) {
            console.log(`Chain ${chainId}: already up to date`);
            continue;
          }

          // Calculate how many blocks we can scan in remaining time
          const remainingTime = MAX_RUNTIME_MS - (Date.now() - startTime);
          const estimatedBlocksPerSecond = 100; // Conservative estimate
          const maxBlocks = Math.floor((remainingTime / 1000) * estimatedBlocksPerSecond);
          const endBlock = Math.min(startBlock + maxBlocks, latestBlockNumber);

          if (endBlock <= startBlock) {
            console.log(`Chain ${chainId}: not enough time remaining, will continue next run`);
            continue;
          }

          // Scan blocks
          const result = await scanBlocks({
            chainId,
            startBlock,
            endBlock,
            topics,
            batchSize: SCAN_BATCH_SIZE,
            verbose: false,
          });

          results.chainsProcessed++;
          results.totalBlocksScanned += result.blocksScanned;
          results.totalEventsProcessed += result.processed;
          results.totalErrors += result.errors;

          // Update last scanned block
          await updateLatestScannedBlock(chainId, endBlock);

          console.log(`Chain ${chainId} done: ${result.blocksScanned} blocks, ${result.processed} events, ${result.errors} errors`);

        } catch (error) {
          const msg = `Chain ${chainId} failed: ${error instanceof Error ? error.message : error}`;
          console.error(msg);
          results.errors.push(msg);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Cron: Completed');
    console.log('='.repeat(60));
    console.log(`Chains processed: ${results.chainsProcessed}`);
    console.log(`Total blocks scanned: ${results.totalBlocksScanned}`);
    console.log(`Total events processed: ${results.totalEventsProcessed}`);
    console.log(`Total errors: ${results.totalErrors}`);
    console.log(`Timed out: ${results.timedOut}`);
    console.log(`Duration: ${Date.now() - startTime}ms`);

    return NextResponse.json({
      success: true,
      ...results,
      durationMs: Date.now() - startTime,
    });

  } catch (error) {
    console.error('Cron job failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...results,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
