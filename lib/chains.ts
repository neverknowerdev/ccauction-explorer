/**
 * Supported chains - single source of truth for chain IDs and config.
 * Reuse everywhere: fetcher, scripts, UI, etc.
 */

import type { Chain } from 'viem';
import { mainnet, base, baseSepolia, arbitrum } from 'viem/chains';

export interface SupportedChainConfig {
  chainId: number;
  chain: Chain;
  name: string;
  rpcUrl: string;
  explorer: string;
  blockTimeSeconds: number;
  /** Default start block for initial scans (reference block ≈ 01.09.2025) */
  defaultStartBlock: number;
  /** Whether this is a testnet */
  isTestnet: boolean;
}

/**
 * Supported chain configurations keyed by chain ID.
 */
export const SUPPORTED_CHAINS: Record<number, SupportedChainConfig> = {
  1: {
    chainId: 1,
    chain: mainnet,
    name: 'Ethereum Mainnet',
    rpcUrl: process.env.ETH_RPC_URL || 'https://eth.drpc.org',
    explorer: 'https://etherscan.io',
    blockTimeSeconds: 12,
    defaultStartBlock: 23_264_569, // 01.09.2025
    isTestnet: false,
  },
  8453: {
    chainId: 8453,
    chain: base,
    name: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    blockTimeSeconds: 2,
    defaultStartBlock: 34_947_737, // 01.09.2025
    isTestnet: false,
  },
  84532: {
    chainId: 84532,
    chain: baseSepolia,
    name: 'Base Sepolia',
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    blockTimeSeconds: 2,
    defaultStartBlock: 9_106_925, // 01.09.2025
    isTestnet: true,
  },
  42161: {
    chainId: 42161,
    chain: arbitrum,
    name: 'Arbitrum One',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io',
    blockTimeSeconds: 0.25, // ~4 blocks per second
    defaultStartBlock: 374_384_102, // 01.09.2025
    isTestnet: false,
  },
};

/**
 * List of supported chain IDs.
 */
export const SUPPORTED_CHAIN_IDS: number[] = Object.keys(SUPPORTED_CHAINS).map(Number);

/**
 * Check if a chain ID is supported.
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS;
}

/**
 * Get config for a chain ID, or undefined if not supported.
 */
export function getChainConfig(chainId: number): SupportedChainConfig | undefined {
  return SUPPORTED_CHAINS[chainId];
}

/**
 * Get default start block for a chain.
 * Returns undefined if chain is not configured.
 */
export function getDefaultStartBlock(chainId: number): number | undefined {
  return SUPPORTED_CHAINS[chainId]?.defaultStartBlock;
}

/**
 * Get all mainnet chain IDs (exclude testnets).
 */
export function getMainnetChainIds(): number[] {
  return Object.values(SUPPORTED_CHAINS)
    .filter(c => !c.isTestnet)
    .map(c => c.chainId);
}

/** Reference timestamp for block-time estimation: 01.09.2025 00:00:00 UTC. Each chain uses its defaultStartBlock as the reference block. */
const REFERENCE_TIMESTAMP = 1756684800; // 2025-09-01T00:00:00Z

/**
 * Estimate block timestamp without RPC. Uses chain block time and reference (defaultStartBlock ≈ 01.09.2025).
 * Suitable for ordering and display; not exact on-chain time.
 */
export function getEstimatedBlockTimestamp(chainId: number, blockNumber: number): Date {
  const config = getChainConfig(chainId);
  if (!config) return new Date(0);
  const { blockTimeSeconds, defaultStartBlock } = config;
  const estimatedUnix = REFERENCE_TIMESTAMP + (blockNumber - defaultStartBlock) * blockTimeSeconds;
  return new Date(estimatedUnix * 1000);
}
