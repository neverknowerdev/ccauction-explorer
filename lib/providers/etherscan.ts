/**
 * Etherscan API provider: contract creation tx, source code, and source hash.
 */

import * as crypto from 'node:crypto';
import type { Address, Hex } from 'viem';
import pRetry from 'p-retry';
import { SUPPORTED_CHAINS, SUPPORTED_CHAIN_IDS } from '../chains';

const ETHERSCAN_API_URL = 'https://api.etherscan.io/v2/api';

/** Timeout for Etherscan API requests (ms) */
const ETHERSCAN_TIMEOUT_MS = 3_000;

/** Retry options for Etherscan API requests */
const ETHERSCAN_RETRY_OPTIONS = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 5000,
};

// =============================================================================
// Types
// =============================================================================

interface EtherscanContractCreationResult {
  contractAddress: string;
  contractCreator: string;
  txHash: string;
  blockNumber: string;
  timestamp: string;
  contractFactory: string;
  creationBytecode: string;
}

interface EtherscanApiResponse {
  status: string;
  message: string;
  result: EtherscanContractCreationResult[] | string;
}

interface EtherscanSourceCodeResult {
  SourceCode: string;
  ABI?: string;
  ContractName?: string;
  CompilerVersion?: string;
  [key: string]: string | undefined;
}

interface EtherscanSourceCodeResponse {
  status: string;
  message: string;
  result: EtherscanSourceCodeResult[] | string;
}

// =============================================================================
// Request counting (for scan-blocks script)
// =============================================================================

let etherscanRequestCount = 0;

export function getEtherscanRequestCount(): number {
  return etherscanRequestCount;
}

export function resetEtherscanRequestCount(): void {
  etherscanRequestCount = 0;
}

// =============================================================================
// Contract creation
// =============================================================================

/**
 * Get the creation transaction hash for a contract address using Etherscan API.
 * Works with any contract, not just auctions.
 */
export async function getContractCreationTxHash(contractAddress: Address, chainId: number): Promise<Hex> {
  if (!SUPPORTED_CHAINS[chainId]) {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported: ${SUPPORTED_CHAIN_IDS.join(', ')}`);
  }

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) throw new Error('ETHERSCAN_API_KEY environment variable is required');

  const url = new URL(ETHERSCAN_API_URL);
  url.searchParams.set('module', 'contract');
  url.searchParams.set('action', 'getcontractcreation');
  url.searchParams.set('contractaddresses', contractAddress);
  url.searchParams.set('chainid', chainId.toString());
  url.searchParams.set('apikey', apiKey);

  const data = await pRetry(
    async () => {
      etherscanRequestCount++;
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(ETHERSCAN_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Etherscan API request failed: ${response.status} ${response.statusText}`);
      }
      return response.json() as Promise<EtherscanApiResponse>;
    },
    ETHERSCAN_RETRY_OPTIONS,
  );

  if (data.status !== '1' || !Array.isArray(data.result) || data.result.length === 0) {
    throw new Error(`Contract creation not found for ${contractAddress}: ${data.message}`);
  }

  return data.result[0].txHash as Hex;
}

// =============================================================================
// Source code
// =============================================================================

/**
 * Fetch verified contract source code from Etherscan.
 * Returns null if contract is not verified or API fails.
 */
export async function getContractSourceCode(contractAddress: Address, chainId: number): Promise<string | null> {
  if (!SUPPORTED_CHAINS[chainId]) return null;

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return null;

  const url = new URL(ETHERSCAN_API_URL);
  url.searchParams.set('module', 'contract');
  url.searchParams.set('action', 'getsourcecode');
  url.searchParams.set('address', contractAddress);
  url.searchParams.set('chainid', chainId.toString());
  url.searchParams.set('apikey', apiKey);

  try {
    const data = await pRetry(
      async () => {
        etherscanRequestCount++;
        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(ETHERSCAN_TIMEOUT_MS),
        });
        if (!response.ok) {
          throw new Error(`Etherscan API request failed: ${response.status}`);
        }
        return response.json() as Promise<EtherscanSourceCodeResponse>;
      },
      ETHERSCAN_RETRY_OPTIONS,
    );
    if (data.status !== '1' || !Array.isArray(data.result) || data.result.length === 0) return null;

    const raw = data.result[0].SourceCode?.trim();
    if (!raw) return null;

    // Multi-file: Etherscan returns JSON like {{"sources": {"file.sol": {"content": "..."}}}}
    let sourceCode: string;
    if (raw.startsWith('{{') && raw.endsWith('}}')) {
      try {
        const parsed = JSON.parse(raw.slice(1, -1)) as { sources?: Record<string, { content?: string }> };
        const sources = parsed.sources;
        if (!sources || typeof sources !== 'object') return raw;
        sourceCode = Object.values(sources)
          .map((s) => (s && typeof s.content === 'string' ? s.content : ''))
          .filter(Boolean)
          .join('\n\n');
      } catch {
        sourceCode = raw;
      }
    } else {
      sourceCode = raw;
    }

    return sourceCode || null;
  } catch {
    return null;
  }
}

/**
 * Normalize source code for stable hashing: single line endings, no comments, trimmed.
 */
export function normalizeSourceCode(source: string): string {
  return source
    .replace(/\r\n|\r/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/\/\/[^\n]*/g, '') // line comments
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Hash normalized source code with SHA-256. Returns hex string.
 */
export function hashSourceCode(source: string): string {
  const normalized = normalizeSourceCode(source);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Fetch contract source from Etherscan and return its hash, or null if not verified.
 */
export async function getContractSourceCodeHash(contractAddress: Address, chainId: number): Promise<string | null> {
  const source = await getContractSourceCode(contractAddress, chainId);
  return source ? hashSourceCode(source) : null;
}
