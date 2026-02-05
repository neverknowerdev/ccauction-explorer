/**
 * Known currency addresses and display names.
 * USDC is used often across chains; addresses are hardcoded for fast lookup.
 * Matches chains in lib/chains.ts (Ethereum, Base, Base Sepolia, Arbitrum One).
 */

import Decimal from 'decimal.js';

// Configure Decimal.js for high precision
Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

/** USDC on Ethereum mainnet (chain 1) */
export const USDC_ADDRESS_MAINNET = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'.toLowerCase();
/** USDC on Base (chain 8453) */
export const USDC_ADDRESS_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'.toLowerCase();
/** USDC on Base Sepolia (chain 84532) */
export const USDC_ADDRESS_BASE_SEPOLIA = '0x036cbd53842c5426634e7929541ec2318f3dcf7e'.toLowerCase();
/** USDC on Arbitrum One (chain 42161) */
export const USDC_ADDRESS_ARBITRUM_ONE = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'.toLowerCase();

export const CURRENCY_NAME_USDC = 'USDC';
export const CURRENCY_NAME_ETH = 'ETH';

/** All known USDC addresses (any chain) for name lookup */
const USDC_ADDRESSES = [
  USDC_ADDRESS_MAINNET,
  USDC_ADDRESS_BASE,
  USDC_ADDRESS_BASE_SEPOLIA,
  USDC_ADDRESS_ARBITRUM_ONE,
] as const;

const KNOWN_CURRENCY_NAMES: Record<string, string> = {
  '0x0000000000000000000000000000000000000000': CURRENCY_NAME_ETH,
  ...Object.fromEntries(USDC_ADDRESSES.map((a) => [a, CURRENCY_NAME_USDC])),
};

/**
 * Returns display name for a currency address (e.g. USDC, ETH), or 'Unknown'.
 */
export function getCurrencyName(address: string | null | undefined): string {
  if (!address || typeof address !== 'string') return 'Unknown';
  const key = address.toLowerCase();
  return KNOWN_CURRENCY_NAMES[key] ?? 'Unknown';
}

/** Decimals for known currencies */
const CURRENCY_DECIMALS: Record<string, number> = {
  '0x0000000000000000000000000000000000000000': 18, // ETH
  ...Object.fromEntries(USDC_ADDRESSES.map((a) => [a, 6])), // USDC = 6 decimals
};

/**
 * Returns decimals for a currency address.
 * USDC = 6, ETH = 18, Unknown defaults to 18.
 */
export function getCurrencyDecimals(address: string | null | undefined): number {
  if (!address || typeof address !== 'string') return 18;
  const key = address.toLowerCase();
  return CURRENCY_DECIMALS[key] ?? 18;
}

/** Max decimal places for PostgreSQL numeric(30,18) columns */
const DB_DECIMAL_PLACES = 18;

/**
 * Strip trailing zeros from decimal string while preserving at least the integer part.
 */
function stripTrailingZeros(str: string): string {
  if (!str.includes('.')) return str;
  return str.replace(/\.?0+$/, '');
}

/**
 * Convert raw currency amount to human-readable decimal string.
 * Uses Decimal.js for arbitrary precision arithmetic.
 * Output is limited to 18 decimal places to match PostgreSQL numeric(30,18) columns.
 * @param amount - Raw amount (e.g., 256607984 for USDC)
 * @param decimals - Currency decimals (e.g., 6 for USDC, 18 for ETH)
 * @returns Decimal string (e.g., "256.607984")
 */
export function currencyAmountToHuman(amount: bigint | string, decimals: number): string {
  // Safety check: ensure decimals is valid
  const safeDecimals = typeof decimals === 'number' && Number.isFinite(decimals) && decimals >= 0 ? decimals : 18;
  
  const value = new Decimal(amount.toString());
  const divisor = new Decimal(10).pow(safeDecimals);
  const result = value.div(divisor);
  return stripTrailingZeros(result.toFixed(DB_DECIMAL_PLACES));
}
