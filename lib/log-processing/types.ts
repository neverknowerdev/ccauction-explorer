/**
 * Shared types for log processing.
 */

import type { Log } from 'viem';
import type { EventErrorType } from '@/lib/events/errors';

// =============================================================================
// PROCESSING RESULT
// =============================================================================

export interface ProcessingResult {
  logIndex: number;
  transactionHash: string;
  status: 'processed' | 'skipped' | 'error';
  eventName?: string;
  error?: string;
  /** Structured error type for programmatic handling */
  errorType?: EventErrorType;
}

export type LogSource = 'ALCHEMY_WEBHOOK' | 'scanScript';

export interface ProcessLogOptions {
  /** Chain ID */
  chainId: number;
  /** Block number (if not in log) */
  blockNumber?: number;
  /** Block timestamp */
  blockTimestamp: Date;
  /** Source identifier for tracking */
  source: LogSource;
  /** Whether to log verbose output */
  verbose?: boolean;
}

// =============================================================================
// SCANNING RESULT
// =============================================================================

export interface ScanResult {
  processed: number;
  skipped: number;
  errors: number;
  blocksScanned: number;
}

// =============================================================================
// ALCHEMY LOG FORMAT
// =============================================================================

/**
 * Alchemy webhook log format (GraphQL response)
 */
export interface AlchemyLog {
  data: string;
  topics: string[];
  index: number;
  account?: { address: string };
  transaction?: {
    hash: string;
    from?: { address: string };
    to?: { address: string };
  };
}

// =============================================================================
// RAW RPC LOG FORMAT
// =============================================================================

/**
 * Raw log format from eth_getLogs RPC call
 */
export interface RawLog {
  address: string;
  blockHash: string;
  blockNumber: string;
  data: string;
  logIndex: string;
  transactionHash: string;
  transactionIndex: string;
  removed?: boolean;
  topics: string[];
}
