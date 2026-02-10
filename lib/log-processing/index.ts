/**
 * Log processing module.
 * Provides utilities for processing blockchain event logs.
 */

// Types
export * from './types';

// Alchemy utilities (from providers)
export {
  getAlchemyRpcUrl,
  getViemChain,
  createAlchemyClient,
  getAlchemyRequestCount,
  resetAlchemyRequestCount,
  alchemyLogToViemLog,
  rawLogToViemLog,
} from '@/lib/providers';

// Log processor
export {
  getCachedEventTopics,
  clearEventTopicsCache,
  processLogEntry,
} from './process-log-entry';

// Block scanner
export {
  scanBlocks,
  CONTRACT_SCAN_BATCH_SIZE,
  type ScanBlocksOptions,
} from './scan-blocks';

// Auction scanner
export { scanAuction, upsertAuctionFromInfo } from './scan-auction';
