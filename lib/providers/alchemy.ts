/**
 * Alchemy provider: RPC client and log format converters.
 */

import type { Log, Hex, Chain, PublicClient, Transport } from 'viem';
import { createPublicClient, http } from 'viem';
import { mainnet, base, baseSepolia, arbitrum, sepolia } from 'viem/chains';
import type { AlchemyLog, RawLog } from '@/lib/log-processing/types';

// =============================================================================
// CHAIN CONFIGURATION
// =============================================================================

/** Alchemy RPC URL patterns per chain ID */
const ALCHEMY_RPC_PATTERNS: Record<number, string> = {
  1: 'https://eth-mainnet.g.alchemy.com/v2/',
  8453: 'https://base-mainnet.g.alchemy.com/v2/',
  42161: 'https://arb-mainnet.g.alchemy.com/v2/',
  84532: 'https://base-sepolia.g.alchemy.com/v2/',
  11155111: 'https://eth-sepolia.g.alchemy.com/v2/',
};

/** Viem chain configs by chain ID */
const VIEM_CHAINS: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
  84532: baseSepolia,
  11155111: sepolia,
};

/**
 * Get Alchemy RPC URL for a chain.
 */
export function getAlchemyRpcUrl(chainId: number): string {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error('ALCHEMY_API_KEY environment variable is not set');
  }

  const pattern = ALCHEMY_RPC_PATTERNS[chainId];
  if (!pattern) {
    throw new Error(`Unsupported chain ID for Alchemy: ${chainId}`);
  }

  return `${pattern}${apiKey}`;
}

/**
 * Get viem Chain config for a chain ID.
 */
export function getViemChain(chainId: number): Chain | undefined {
  return VIEM_CHAINS[chainId];
}

// =============================================================================
// REQUEST COUNTING (for scan-blocks script)
// =============================================================================

let alchemyRequestCount = 0;

export function getAlchemyRequestCount(): number {
  return alchemyRequestCount;
}

export function resetAlchemyRequestCount(): void {
  alchemyRequestCount = 0;
}

function countingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  alchemyRequestCount++;
  return fetch(input, init);
}

/**
 * Create a viem public client for a chain using Alchemy.
 */
export function createAlchemyClient(chainId: number): PublicClient<Transport, Chain> {
  const rpcUrl = getAlchemyRpcUrl(chainId);
  const chain = getViemChain(chainId);

  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  return createPublicClient({
    chain,
    transport: http(rpcUrl, {
      fetchFn: countingFetch,
      batch: { batchSize: 100 },
    }),
  });
}

// =============================================================================
// LOG FORMAT CONVERTERS
// =============================================================================

/**
 * Convert Alchemy webhook log format to viem's standard Log type.
 */
export function alchemyLogToViemLog(
  alchemyLog: AlchemyLog,
  blockNumber: number,
  blockHash?: string
): Log {
  return {
    address: (alchemyLog.account?.address ?? '') as `0x${string}`,
    blockHash: (blockHash ?? null) as `0x${string}` | null,
    blockNumber: BigInt(blockNumber),
    data: alchemyLog.data as `0x${string}`,
    logIndex: alchemyLog.index,
    transactionHash: (alchemyLog.transaction?.hash ?? null) as `0x${string}` | null,
    transactionIndex: null,
    removed: false,
    topics: alchemyLog.topics as [`0x${string}`, ...`0x${string}`[]] | [],
  };
}

/**
 * Convert raw RPC log (from eth_getLogs) to viem's standard Log type.
 */
export function rawLogToViemLog(rawLog: RawLog): Log {
  return {
    address: rawLog.address as Hex,
    blockHash: rawLog.blockHash as Hex,
    blockNumber: BigInt(rawLog.blockNumber),
    data: rawLog.data as Hex,
    logIndex: parseInt(rawLog.logIndex, 16),
    transactionHash: rawLog.transactionHash as Hex,
    transactionIndex: parseInt(rawLog.transactionIndex, 16),
    removed: rawLog.removed ?? false,
    topics: rawLog.topics as [`0x${string}`, ...`0x${string}`[]] | [],
  };
}
