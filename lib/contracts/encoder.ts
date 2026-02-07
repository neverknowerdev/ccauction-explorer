/**
 * Encoding utilities for CCA (Continuous Clearing Auction) contracts
 * 
 * Based on Uniswap's liquidity-launchpad documentation:
 * https://docs.uniswap.org/contracts/liquidity-launchpad/quickstart/example-configuration
 */

import { encodeAbiParameters, parseAbiParameters, toHex, type Hex } from 'viem';

// ============================================================================
// Constants
// ============================================================================

/** Total supply percentage in MPS (milli-basis points): 1e7 = 100% */
export const MPS_TOTAL = 10_000_000;

/** Q96 multiplier for Uniswap V4 price encoding */
export const Q96 = BigInt(2) ** BigInt(96);

/** Fee tier label -> LP fee (Uniswap hundredths of a basis point: 500 = 0.05%, 3000 = 0.3%, 10000 = 1%) */
export const FEE_TIER_TO_LP_FEE: Record<string, number> = {
  '0.05%': 500,
  '0.3%': 3000,
  '1.0%': 10000,
};

/** Fee tier label -> tick spacing (Uniswap V3: 10 for 0.05%, 60 for 0.3%, 200 for 1%) */
export const FEE_TIER_TO_TICK_SPACING: Record<string, number> = {
  '0.05%': 10,
  '0.3%': 60,
  '1.0%': 200,
};

// ============================================================================
// Types
// ============================================================================

export interface UERC20Metadata {
  description: string;
  website: string;
  image: string;
}

export interface AuctionStep {
  /** Per-block issuance rate in MPS (1e7 total = 100% of supply) */
  mps: number;
  /** Number of blocks this rate applies */
  blockDelta: number;
}

export interface AuctionConfig {
  currency: Hex;
  tokensRecipient: Hex;
  fundsRecipient: Hex;
  startBlock: bigint;
  endBlock: bigint;
  claimBlock: bigint;
  tickSpacing: bigint;
  validationHook: Hex;
  floorPrice: bigint;
  requiredCurrencyRaised: bigint;
  auctionStepsData: Hex;
}

// ============================================================================
// Encoding Functions
// ============================================================================

/**
 * Encode UERC20 token metadata for the token factory
 */
export function encodeTokenMetadata(metadata: UERC20Metadata): Hex {
  return encodeAbiParameters(
    parseAbiParameters('(string description, string website, string image)'),
    [{ description: metadata.description, website: metadata.website, image: metadata.image }]
  );
}

/**
 * Encode auction steps data for the CCA contract
 * 
 * Each step is 8 bytes (bytes8) packed as:
 * - High 24 bits (first 3 bytes): mps rate
 * - Low 40 bits (last 5 bytes): blockDelta
 * 
 * The contract parses: mps = uint24(bytes3(data)), blockDelta = uint40(uint64(data))
 * 
 * @example
 * // Sell 100% of tokens evenly over 100 blocks in 2 steps
 * encodeAuctionSteps([
 *   { mps: 100_000, blockDelta: 50 },  // 50% over 50 blocks
 *   { mps: 100_000, blockDelta: 50 },  // 50% over 50 blocks
 * ])
 */
export function encodeAuctionSteps(steps: AuctionStep[]): Hex {
  let data = '0x';
  for (const step of steps) {
    // Pack: mps in high 24 bits (shift by 40), blockDelta in low 40 bits
    const packed = (BigInt(step.mps) << 40n) | BigInt(step.blockDelta);
    data += packed.toString(16).padStart(16, '0');
  }
  return data as Hex;
}

/**
 * Encode AuctionParameters struct for the CCA Factory
 * 
 * @see https://docs.uniswap.org/contracts/liquidity-launchpad/quickstart/example-configuration
 */
export function encodeAuctionConfig(config: AuctionConfig): Hex {
  return encodeAbiParameters(
    parseAbiParameters(
      '(address,address,address,uint64,uint64,uint64,uint256,address,uint256,uint128,bytes)'
    ),
    [[
      config.currency,
      config.tokensRecipient,
      config.fundsRecipient,
      config.startBlock,
      config.endBlock,
      config.claimBlock,
      config.tickSpacing,
      config.validationHook,
      config.floorPrice,
      config.requiredCurrencyRaised,
      config.auctionStepsData,
    ]]
  );
}

/**
 * Convert a decimal price to Q96 fixed-point format (used by Uniswap V4)
 * 
 * Q96 format represents the ratio of currency to token.
 * For example, a price of 0.001 means 0.001 currency per token.
 * 
 * @param price - Price as a decimal number
 * @returns Price in Q96 format (price * 2^96)
 */
export function priceToQ96(price: number): bigint {
  const priceBigInt = BigInt(Math.floor(price * 1e18));
  return (priceBigInt * Q96) / BigInt(1e18);
}

/**
 * Generate a random 32-byte salt
 */
export function generateSalt(): Hex {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return toHex(randomBytes);
}

// ============================================================================
// Preset Auction Step Generators
// ============================================================================

export type AuctionPreset = 'flat' | 'front-loaded' | 'back-loaded' | 'uniswap-example';

/** Alias for UI/form usage (same as AuctionPreset) */
export type TokenReleasePreset = AuctionPreset;

/**
 * Generate auction steps based on a preset
 * 
 * @param durationBlocks - Total auction duration in blocks
 * @param preset - Release schedule preset
 */
export function generateAuctionSteps(
  durationBlocks: number,
  preset: AuctionPreset = 'uniswap-example'
): AuctionStep[] {
  switch (preset) {
    case 'uniswap-example':
      // Following Uniswap docs: 10% over 50 blocks, 49% over 49 blocks, 41% in last block
      // Total: 100 blocks
      return [
        { mps: 20_000, blockDelta: 50 },    // 20000 * 50 = 1,000,000 = 10%
        { mps: 100_000, blockDelta: 49 },   // 100000 * 49 = 4,900,000 = 49%
        { mps: 4_100_000, blockDelta: 1 },  // 4100000 * 1 = 4,100,000 = 41%
      ];

    case 'flat': {
      // Constant rate across all blocks
      const mps = Math.floor(MPS_TOTAL / durationBlocks);
      return [{ mps, blockDelta: durationBlocks }];
    }

    case 'front-loaded': {
      // Release more tokens early
      const half = Math.floor(durationBlocks / 2);
      return [
        { mps: Math.floor((MPS_TOTAL * 0.7) / half), blockDelta: half },
        { mps: Math.floor((MPS_TOTAL * 0.3) / (durationBlocks - half)), blockDelta: durationBlocks - half },
      ];
    }

    case 'back-loaded': {
      // Release more tokens late (recommended for price discovery)
      const half = Math.floor(durationBlocks / 2);
      return [
        { mps: Math.floor((MPS_TOTAL * 0.3) / half), blockDelta: half },
        { mps: Math.floor((MPS_TOTAL * 0.7) / (durationBlocks - half)), blockDelta: durationBlocks - half },
      ];
    }

    default:
      throw new Error(`Unknown preset: ${preset}`);
  }
}

/**
 * Validate that auction steps sum to exactly 100% (MPS_TOTAL)
 */
export function validateAuctionSteps(steps: AuctionStep[]): { valid: boolean; totalMps: number; error?: string } {
  let totalMps = 0;
  let totalBlocks = 0;

  for (const step of steps) {
    if (step.blockDelta <= 0) {
      return { valid: false, totalMps: 0, error: 'blockDelta must be positive' };
    }
    if (step.mps <= 0) {
      return { valid: false, totalMps: 0, error: 'mps must be positive' };
    }
    totalMps += step.mps * step.blockDelta;
    totalBlocks += step.blockDelta;
  }

  if (totalMps !== MPS_TOTAL) {
    return {
      valid: false,
      totalMps,
      error: `Total MPS is ${totalMps}, expected ${MPS_TOTAL} (100%)`,
    };
  }

  return { valid: true, totalMps };
}
