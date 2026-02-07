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

/** Fallback batch size when provider returns "response size exceeded" and we can't parse the hint */
const FALLBACK_SMALL_BATCH = 10_000;

/** Minimum chunk size when sub-dividing; avoid infinite recursion */
const MIN_CHUNK_BLOCKS = 500;

/** Match Alchemy's recommended block range hint: "[0x16c5132, 0x16cdbc8]" */
const RECOMMENDED_RANGE_RE = /\[\s*(0x[a-fA-F0-9]+)\s*,\s*(0x[a-fA-F0-9]+)\s*\]/;

function parseRecommendedBlockRange(error: unknown): number | null {
  const message =
    (error && typeof error === 'object' && 'cause' in error && error.cause && typeof (error.cause as any).message === 'string')
      ? (error.cause as { message: string }).message
      : (error instanceof Error ? error.message : String(error));
  const match = message.match(RECOMMENDED_RANGE_RE);
  if (!match) return null;
  const from = parseInt(match[1], 16);
  const to = parseInt(match[2], 16);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return to - from + 1;
}

function isLogResponseSizeExceeded(error: unknown): boolean {
  const code =
    (error && typeof error === 'object' && 'cause' in error && error.cause && typeof (error.cause as any).code === 'number')
      ? (error.cause as { code: number }).code
      : (error && typeof error === 'object' && 'code' in error && typeof (error as any).code === 'number')
        ? (error as { code: number }).code
        : undefined;
  if (code === -32602) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /log response size exceeded|response size limit/i.test(message);
}

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

  async function fetchAndProcessLogs(from: number, to: number): Promise<void> {
    const filterParams: Record<string, unknown> = {
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${to.toString(16)}`,
    };
    if (address) filterParams.address = address;
    if (topics && topics.length > 0) filterParams.topics = [topics];

    const rawLogs = await client.request({
      method: 'eth_getLogs',
      params: [filterParams],
    }) as RawLog[];

    const logs = rawLogs.map(rawLogToViemLog);
    if (verbose || logs.length > 0) {
      console.log(`  Found ${logs.length} logs in blocks ${from}-${to}`);
    }

    for (const log of logs) {
      if (log.blockNumber === null) {
        console.log(`  [SKIP] Missing block number for log`);
        continue;
      }
      if (topics && topics.length > 0) {
        const topic0 = log.topics?.[0];
        if (!topic0 || !topics.includes(topic0 as Hex)) continue;
      }
      const blockTimestamp = getEstimatedBlockTimestamp(chainId, Number(log.blockNumber));
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
  }

  /** Fetch range; on "response size exceeded", sub-divide and retry each part (recursive). */
  async function fetchRangeWithRetry(from: number, to: number): Promise<void> {
    try {
      await fetchAndProcessLogs(from, to);
    } catch (error) {
      if (!isLogResponseSizeExceeded(error)) {
        throw error;
      }
      const rangeBlocks = to - from + 1;
      if (rangeBlocks <= MIN_CHUNK_BLOCKS) {
        console.error(`Still exceeded after sub-division (blocks ${from}-${to}, ${rangeBlocks} blocks); rethrowing`);
        throw error;
      }
      const recommendedSize = parseRecommendedBlockRange(error) ?? FALLBACK_SMALL_BATCH;
      const chunkSize = Math.max(MIN_CHUNK_BLOCKS, Math.min(recommendedSize, rangeBlocks));
      console.warn(`  Log response size exceeded for blocks ${from}-${to}; retrying in chunks of ${chunkSize}`);
      for (let f = from; f <= to; f += chunkSize) {
        const t = Math.min(f + chunkSize - 1, to);
        await fetchRangeWithRetry(f, t);
      }
    }
  }

  // Scan in batches
  for (let fromBlock = startBlock; fromBlock <= endBlock; fromBlock += batchSize) {
    const toBlock = Math.min(fromBlock + batchSize - 1, endBlock);

    if (verbose) {
      console.log(`  Fetching logs for blocks ${fromBlock} - ${toBlock}...`);
    }

    await fetchRangeWithRetry(fromBlock, toBlock);
  }

  const blocksScanned = endBlock - startBlock + 1;

  return {
    processed: totalProcessed,
    skipped: totalSkipped,
    errors: totalErrors,
    blocksScanned,
  };
}
