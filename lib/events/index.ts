export * from './decoder';
export * from './handlers';
export * from './errors';

// Re-export log processing utilities from the new module for backward compatibility
export {
  processLogEntry,
  getCachedEventTopics,
  clearEventTopicsCache,
  scanBlocks,
  scanAuction,
  alchemyLogToViemLog,
  rawLogToViemLog,
  type ProcessingResult,
  type ProcessLogOptions,
  type LogSource,
  type AlchemyLog,
  type RawLog,
  type ScanResult,
  type ScanBlocksOptions,
} from '@/lib/log-processing';
