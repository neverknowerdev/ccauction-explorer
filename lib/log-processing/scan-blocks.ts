/**
 * Block scanning utilities.
 * Provides function to scan blocks for events with various filters.
 */

import type { Hex, Log } from 'viem';
import { createAlchemyClient, rawLogToViemLog } from '@/lib/providers';
import { getEstimatedBlockTimestamp } from '@/lib/chains';
import { processLogEntry, getCachedEventTopics } from './process-log-entry';
import type { RawLog, ScanResult } from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Default batch size for block scanning (Alchemy supports up to 10k for most chains on paid plans) */
const DEFAULT_BATCH_SIZE = 50_000;

/** Large batch size for contract-specific scanning (filtering by address is more efficient) */
export const CONTRACT_SCAN_BATCH_SIZE = 100000;

// =============================================================================
// BLOCK SCANNING
// =============================================================================

export interface ScanBlocksOptions {
  chainId: number;
  startBlock: number;
  endBlock: number;
  /** Event topic0 hashes to filter for (OR filter) */
  topics?: Hex[];
  /** Contract address to filter for */
  address?: string;
  /** Batch size for eth_getLogs calls */
  batchSize?: number;
  /** Whether to log verbose output */
  verbose?: boolean;
}

/**
 * Scan blocks for events matching the given filters.
 * Uses eth_getLogs with optional topic and address filters.
 * 
 */
export async function scanBlocks(options: ScanBlocksOptions): Promise<ScanResult> {
  const {
    chainId,
    startBlock,
    endBlock,
    topics,
    address,
    batchSize = address ? CONTRACT_SCAN_BATCH_SIZE : DEFAULT_BATCH_SIZE,
    verbose = false,
  } = options;

  const client = createAlchemyClient(chainId);
  const knownEventTopics = await getCachedEventTopics();

  console.log(`\nScanning chain ${chainId} from block ${startBlock} to ${endBlock}`);
  if (address) {
    console.log(`  Contract: ${address}`);
  }
  if (topics && topics.length > 0) {
    console.log(`  Topics: ${topics.length}`);
    for (const topic of topics) {
      const eventTopic = knownEventTopics.find(et => et.topic0.toLowerCase() === topic.toLowerCase());
      console.log(`    - ${eventTopic?.eventName ?? 'Unknown'}: ${topic.slice(0, 18)}...`);
    }
  }

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Scan in batches
  for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += batchSize) {
    const toBlock = Math.min(fromBlock + batchSize - 1, endBlock);

    if (verbose) {
      console.log(`  Fetching logs for blocks ${fromBlock} - ${toBlock}...`);
    }

    try {
      // Build filter params
      const filterParams: Record<string, unknown> = {
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
      };

      if (address) {
        filterParams.address = address;
      }

      if (topics && topics.length > 0) {
        // Array of topics = OR filter for topic0
        filterParams.topics = [topics];
      }

      const rawLogs = await client.request({
        method: 'eth_getLogs',
        params: [filterParams],
      }) as RawLog[];

      const logs = rawLogs.map(rawLogToViemLog);

      if (verbose || logs.length > 0) {
        console.log(`  Found ${logs.length} logs in blocks ${fromBlock}-${toBlock}`);
      }

      for (const log of logs) {
        // Skip if blockNumber is null
        if (log.blockNumber === null) {
          console.log(`  [SKIP] Missing block number for log`);
          continue;
        }

        // Verify topic filter if specified
        if (topics && topics.length > 0) {
          const topic0 = log.topics?.[0];
          if (!topic0 || !topics.includes(topic0 as Hex)) {
            continue;
          }
        }

        // Estimate block time from chain config (no RPC)
        const blockTimestamp = getEstimatedBlockTimestamp(chainId, Number(log.blockNumber));

        // Process the log (on "auction not found" we just count the error and continue)
        const result = await processLogEntry(log, {
          chainId,
          blockNumber: Number(log.blockNumber),
          blockTimestamp,
          source: 'scanScript',
          verbose,
        });

        if (result.status === 'processed') totalProcessed++;
        else if (result.status === 'skipped') totalSkipped++;
        else totalErrors++;
      }

    } catch (error) {
      console.error(`Error scanning blocks ${fromBlock}-${toBlock}:`, error);
      throw error;
    }
  }

  const blocksScanned = endBlock - startBlock + 1;

  return {
    processed: totalProcessed,
    skipped: totalSkipped,
    errors: totalErrors,
    blocksScanned,
  };
}
