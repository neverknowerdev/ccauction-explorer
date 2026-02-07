/**
 * Block Scanner Script
 *
 * Scans blockchain blocks for specific events and processes them.
 * Uses Alchemy as RPC provider and stores progress in database.
 *
 * Usage:
 *   yarn scan-blocks
 *
 * Environment variables (from .env.local if present, then shell env):
 *   DB_CONNECTION_STRING - PostgreSQL connection string
 *   ALCHEMY_API_KEY - Alchemy API key for RPC access
 *   BLOCK_SCAN_LIMIT - Optional. If set, exit after scanning this many blocks (total across chains).
 *   CHAINS_TO_SCAN - Optional. Comma-separated chain IDs (e.g. "1,8453"). If set, scan only these; otherwise scan all active chains from DB.
 *   START_BLOCK_NUMBER - Optional. If set, use as start block when nothing in DB yet (for all chains); otherwise use per-chain Jan 1, 2026 defaults.
 */

import type { Hex } from 'viem';
import { eq } from 'drizzle-orm';
import './helpers/load-env';
import { db, chains, ethPrices, getLatestProcessedBlock } from '../lib/db';
import { getDefaultStartBlock } from '../lib/chains';
import {
  scanBlocks,
  getCachedEventTopics,
} from '../lib/log-processing';
import {
  createAlchemyClient,
  getAlchemyRequestCount,
  resetAlchemyRequestCount,
  getEtherscanRequestCount,
  resetEtherscanRequestCount,
  getEthUsdPrice,
} from '../lib/providers';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** If set, exit after scanning this many blocks total (across all chains). */
const BLOCK_SCAN_LIMIT = process.env.BLOCK_SCAN_LIMIT
  ? parseInt(process.env.BLOCK_SCAN_LIMIT, 10)
  : undefined;

/** If set, scan only these chain IDs; otherwise scan all active chains from DB. */
function getChainsToScan(): number[] | undefined {
  const raw = process.env.CHAINS_TO_SCAN?.trim();
  if (!raw) return undefined;
  return raw
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !Number.isNaN(n));
}

/** If set, use as start block when nothing in DB yet (for all chains). */
const START_BLOCK_NUMBER = process.env.START_BLOCK_NUMBER
  ? parseInt(process.env.START_BLOCK_NUMBER, 10)
  : undefined;

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

async function getActiveChains(): Promise<number[]> {
  const onlyChains = getChainsToScan();
  if (onlyChains != null && onlyChains.length > 0) {
    return onlyChains;
  }

  const result = await db
    .select({ id: chains.id })
    .from(chains)
    .where(eq(chains.isActive, true));

  return result.map(r => r.id);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  resetAlchemyRequestCount();
  resetEtherscanRequestCount();

  console.log('='.repeat(60));
  console.log('Block Scanner Started');
  console.log('='.repeat(60));
  if (BLOCK_SCAN_LIMIT != null) {
    console.log(`BLOCK_SCAN_LIMIT: ${BLOCK_SCAN_LIMIT}`);
  }
  if (START_BLOCK_NUMBER != null) {
    console.log(`START_BLOCK_NUMBER: ${START_BLOCK_NUMBER}`);
  }
  const chainsFilter = getChainsToScan();
  if (chainsFilter != null && chainsFilter.length > 0) {
    console.log(`CHAINS_TO_SCAN: ${chainsFilter.join(', ')}`);
  } else {
    console.log('Chains: all active (from DB)');
  }
  console.log('');

  // Fetch and store ETH price first so bid amount_usd can use it during this run
  try {
    const priceUsd = await getEthUsdPrice();
    if (priceUsd != null && Number.isFinite(priceUsd)) {
      await db.insert(ethPrices).values({
        timestamp: new Date(),
        price: priceUsd.toString(),
      });
      console.log(`ETH price stored: $${priceUsd}`);
    } else {
      console.warn('ETH price unavailable (CoinGecko), continuing without new price');
    }
  } catch (err) {
    console.warn('Could not fetch/store ETH price:', err instanceof Error ? err.message : err);
  }
  console.log('');

  const activeChainIds = await getActiveChains();
  console.log(`Chains to scan: ${activeChainIds.join(', ')}`);

  // Get event topics (cached in memory inside log processor)
  const knownEventTopics = await getCachedEventTopics();
  console.log(`Event topics: ${knownEventTopics.length}`);

  // Extract unique topic0 values to filter logs
  const topics = knownEventTopics.map(t => t.topic0 as Hex);
  console.log(`Topics to scan: ${topics.map(t => t.slice(0, 10) + '...').join(', ')}`);

  let totalBlocksScanned = 0;

  // Process each chain
  for (const chainId of activeChainIds) {
    // Start from MAX(block_number) - 1 from processed_logs for this chain (we skip already processed logs)
    const maxProcessedBlock = await getLatestProcessedBlock(chainId);
    let startBlock: number;

    if (maxProcessedBlock == null || maxProcessedBlock === 0) {
      // No logs processed yet - use START_BLOCK_NUMBER if set, else per-chain default
      const defaultStart = getDefaultStartBlock(chainId);
      startBlock = START_BLOCK_NUMBER ?? defaultStart ?? 0;
      if (startBlock === 0) {
        console.warn(`No start block defined for chain ${chainId}, skipping`);
        continue;
      }
      console.log(`First scan for chain ${chainId}, starting from block ${startBlock}${START_BLOCK_NUMBER != null ? ' (START_BLOCK_NUMBER)' : ' (default)'}`);
    } else {
      startBlock = maxProcessedBlock - 1;
      console.log(`Chain ${chainId}: resuming from block ${startBlock} (max processed: ${maxProcessedBlock})`);
    }

    // Get latest block from chain
    let client;
    try {
      client = createAlchemyClient(chainId);
    } catch (error) {
      console.warn(`Chain ${chainId} not supported by Alchemy client, skipping`);
      continue;
    }

    const latestBlockNumber = await client.getBlockNumber();
    console.log(`Chain ${chainId} latest block: ${latestBlockNumber}`);

    // Calculate end block: chain tip, optionally capped by BLOCK_SCAN_LIMIT
    let endBlock = Number(latestBlockNumber);
    if (BLOCK_SCAN_LIMIT != null && BLOCK_SCAN_LIMIT > 0) {
      const remaining = BLOCK_SCAN_LIMIT - totalBlocksScanned;
      if (remaining <= 0) {
        console.log(`Block scan limit reached (${BLOCK_SCAN_LIMIT}), skipping remaining chains`);
        break;
      }
      endBlock = Math.min(endBlock, startBlock + remaining - 1);
    }

    if (startBlock > endBlock) {
      console.log(`Chain ${chainId} is already up to date`);
      continue;
    }

    // Use the shared scanBlocks function
    const result = await scanBlocks({
      chainId,
      startBlock,
      endBlock,
      topics,
      verbose: false,
    });

    totalBlocksScanned += result.blocksScanned;

    console.log(`\nChain ${chainId} Summary:`);
    console.log(`  Blocks scanned: ${result.blocksScanned}`);
    console.log(`  Processed: ${result.processed}`);
    console.log(`  Skipped: ${result.skipped}`);
    console.log(`  Errors: ${result.errors}`);
    if (BLOCK_SCAN_LIMIT != null) {
      console.log(`  Total blocks scanned this run: ${totalBlocksScanned} / ${BLOCK_SCAN_LIMIT}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Block Scanner Completed');
  console.log('='.repeat(60));
  console.log(`  Alchemy requests:   ${getAlchemyRequestCount()}`);
  console.log(`  Etherscan requests: ${getEtherscanRequestCount()}`);
  console.log('='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
