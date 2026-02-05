export {
  // Main fetch functions
  fetchAuctionInfoFromTx,
  fetchAuctionInfoFromAddress,
  fetchAuctionOnChainInfo,

  // Helper functions (also exported for testing)
  getClient,
  blockToTime,
  formatDuration,
  formatQ96Price,
  getCurrencySymbol,
  getContractName,
  getStrategyFactoryName,
  decodeAuctionSteps,
  decodeAuctionConfig,
  calculateTokenSupplyInfo,

  // Output formatting
  printAuctionInfo,

  // Chain support
  isChainSupported,

  // Types
  type AuctionParameters,
  type MigratorParameters,
  type PoolInfo,
  type AuctionStep,
  type TimeInfo,
  type TokenSupplyInfo,
  type TokenMintInfo,
  type AuctionInfo,
  type AuctionOnChainInfo,
} from './fetcher';

export {
  getContractSourceCode,
  getContractSourceCodeHash,
  hashSourceCode,
  normalizeSourceCode,
  getEtherscanRequestCount,
  resetEtherscanRequestCount,
} from '@/lib/providers';
