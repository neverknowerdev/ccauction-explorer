import Decimal from 'decimal.js';

// Configure Decimal.js for high precision (Q96 needs ~30 decimal places)
Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

/** Q96 fixed-point divisor (2^96) used by CCA for prices */
const Q96_DECIMAL = new Decimal(2).pow(96);

/** Max decimal places for PostgreSQL numeric(30,18) columns */
const DB_DECIMAL_PLACES = 18;

/**
 * Strip trailing zeros from decimal string while preserving at least the integer part.
 * "123.450000" → "123.45"
 * "123.000000" → "123"
 * "0.000000000000099999" → "0.000000000000099999" (preserves significant digits)
 */
function stripTrailingZeros(str: string): string {
  if (!str.includes('.')) return str;
  // Remove trailing zeros, then trailing dot if present
  return str.replace(/\.?0+$/, '');
}

/**
 * Convert Q96 fixed-point price (from contract) to a display/storage price that accounts for
 * token and currency decimals.
 *
 * Contracts emit price in raw ratio units. To get user-facing price (currency per 1 token),
 * we apply:
 *   (raw / 2^96) * 10^(tokenDecimals - currencyDecimals)
 */
export function q96ToPrice(
  raw: bigint | string,
  tokenDecimals: number,
  currencyDecimals: number
): string {
  const safeTokenDecimals = Number.isFinite(tokenDecimals) ? tokenDecimals : 18;
  const safeCurrencyDecimals = Number.isFinite(currencyDecimals) ? currencyDecimals : 18;
  const decimalShift = safeTokenDecimals - safeCurrencyDecimals;

  const value = new Decimal(raw.toString());
  const ratio = value.div(Q96_DECIMAL);
  const result = ratio.mul(new Decimal(10).pow(decimalShift));
  // Use toFixed(18) to match DB precision, then strip trailing zeros for cleaner output
  return stripTrailingZeros(result.toFixed(DB_DECIMAL_PLACES));
}

/**
 * Convert token amount (raw units) to human-readable decimal string using token decimals.
 * Uses Decimal.js for arbitrary precision arithmetic.
 * Output is limited to 18 decimal places to match PostgreSQL numeric(30,18) columns.
 */
export function tokenAmountToHuman(amount: bigint | string, decimals: number): string {
  const value = new Decimal(amount.toString());
  const divisor = new Decimal(10).pow(decimals);
  const result = value.div(divisor);
  return stripTrailingZeros(result.toFixed(DB_DECIMAL_PLACES));
}

export function formatWalletAddress(address: string | null, startLength = 6, endLength = 4): string {
  if (!address) return 'Not connected';
  if (address.length <= startLength + endLength) return address;
  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

// Subscript digits for crypto price formatting
const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

function toSubscript(num: number): string {
  return num.toString().split('').map(d => SUBSCRIPT_DIGITS[parseInt(d)]).join('');
}

/**
 * Format price in crypto-standard notation
 * - Normal: 0.01303, 0.0005720
 * - Collapsed zeros: 0.0₄7466 (means 0.00007466, subscript shows zero count)
 * 
 * @param price - The price to format
 * @param options - Optional configuration
 * @param options.minZerosToCollapse - Minimum leading zeros to trigger collapse (default: 4)
 * @param options.significantDigits - Number of significant digits to show (default: 4)
 */
export function formatCryptoPrice(
  price: number,
  options?: { minZerosToCollapse?: number; significantDigits?: number }
): string {
  const { minZerosToCollapse = 4, significantDigits = 4 } = options || {};

  if (price === 0) return '0';
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.001) return price.toFixed(6);

  // For very small numbers, count leading zeros after decimal
  const str = price.toFixed(18); // Max precision
  const match = str.match(/^0\.(0*)([1-9]\d*)/);

  if (!match) return price.toFixed(6);

  const leadingZeros = match[1].length;
  const sigDigits = match[2].slice(0, significantDigits);

  // If enough leading zeros, use subscript notation
  if (leadingZeros >= minZerosToCollapse) {
    return `0.0${toSubscript(leadingZeros)}${sigDigits}`;
  }

  // Otherwise show normally with appropriate precision
  return price.toFixed(leadingZeros + significantDigits);
}
