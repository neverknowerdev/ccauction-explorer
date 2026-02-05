import { describe, it, expect } from 'vitest';
import {
  q96ToHuman,
  tokenAmountToHuman,
  formatWalletAddress,
  formatCryptoPrice,
} from './format';

const Q96 = BigInt(2) ** BigInt(96);

describe('q96ToHuman', () => {
  it('returns "0" for zero', () => {
    expect(q96ToHuman(BigInt(0))).toBe('0');
    expect(q96ToHuman('0')).toBe('0');
  });

  it('returns whole number when remainder is zero', () => {
    expect(q96ToHuman(Q96)).toBe('1');
    expect(q96ToHuman(Q96 * 2n)).toBe('2');
    expect(q96ToHuman(Q96 * 100n)).toBe('100');
  });

  it('converts fractional Q96 to decimal string', () => {
    // 0.5 in Q96 = Q96/2 (exact in binary)
    expect(q96ToHuman(Q96 / 2n)).toBe('0.5');
    // 0.25 in Q96 = Q96/4 (exact)
    expect(q96ToHuman(Q96 / 4n)).toBe('0.25');
  });

  it('accepts string input', () => {
    expect(q96ToHuman(Q96.toString())).toBe('1');
    expect(q96ToHuman('0')).toBe('0');
  });

  it('preserves precision for large raw values (no Number loss)', () => {
    // 1 + 1/1000 in Q96: Decimal.js preserves full precision
    const raw = Q96 + Q96 / 1000n;
    const result = q96ToHuman(raw);
    // Result starts with expected value (Decimal.js may have more precision)
    expect(result.startsWith('1.000999999999999999')).toBe(true);
  });

  it('trims trailing zeros in fractional part', () => {
    // 1.5 in Q96
    const raw = (Q96 * 3n) / 2n;
    expect(q96ToHuman(raw)).toBe('1.5');
  });

  it('handles very small values without producing malformed strings', () => {
    // A very small Q96 value (1 / 2^96 ≈ 1.26e-29) is smaller than DB precision (1e-18)
    // So it correctly becomes "0" after limiting to 18 decimal places
    const raw = BigInt(1);
    const result = q96ToHuman(raw);
    // Should not produce "0." - should be clean "0"
    expect(result).not.toMatch(/\.$/);
    expect(result).toBe('0');
  });

  it('preserves non-zero values within DB precision', () => {
    // A Q96 value that results in ~1e-13 should be preserved
    // 7922816251426400 / 2^96 ≈ 1e-13 which is within 18 decimal places
    const raw = BigInt('7922816251426400');
    const result = q96ToHuman(raw);
    expect(result).not.toBe('0');
    expect(result.startsWith('0.00000000000009')).toBe(true);
  });
});

describe('tokenAmountToHuman', () => {
  it('returns "0" for zero', () => {
    expect(tokenAmountToHuman(BigInt(0), 18)).toBe('0');
    expect(tokenAmountToHuman('0', 18)).toBe('0');
  });

  it('returns whole number when remainder is zero', () => {
    expect(tokenAmountToHuman(BigInt(1e18), 18)).toBe('1');
    expect(tokenAmountToHuman(BigInt(100), 0)).toBe('100');
    expect(tokenAmountToHuman('1000000000000000000', 18)).toBe('1');
  });

  it('converts with fractional part using token decimals', () => {
    expect(tokenAmountToHuman(1500000000000000000n, 18)).toBe('1.5');
    expect(tokenAmountToHuman(1n, 18)).toBe('0.000000000000000001');
    expect(tokenAmountToHuman(1234567890123456789n, 18)).toBe('1.234567890123456789');
  });

  it('accepts string input', () => {
    expect(tokenAmountToHuman('1000000000000000000', 18)).toBe('1');
  });

  it('handles decimals 0 (integer only)', () => {
    expect(tokenAmountToHuman(42n, 0)).toBe('42');
    expect(tokenAmountToHuman(99n, 0)).toBe('99');
  });

  it('trims trailing zeros in fractional part', () => {
    expect(tokenAmountToHuman(1000000000000000000n, 18)).toBe('1');
    expect(tokenAmountToHuman(500000000000000000n, 18)).toBe('0.5');
  });

  it('handles small decimals (e.g. USDC 6)', () => {
    expect(tokenAmountToHuman(1_000_000n, 6)).toBe('1');
    expect(tokenAmountToHuman(1_500_000n, 6)).toBe('1.5');
  });
});

describe('formatWalletAddress', () => {
  it('returns "Not connected" for null/undefined', () => {
    expect(formatWalletAddress(null)).toBe('Not connected');
    expect(formatWalletAddress(undefined as unknown as string)).toBe('Not connected');
  });

  it('returns address as-is when shorter than start+end length', () => {
    expect(formatWalletAddress('0x1234')).toBe('0x1234');
    // 9 chars < 6+4 so returned as-is
    expect(formatWalletAddress('0x12345678', 6, 4)).toBe('0x12345678');
  });

  it('truncates long address with ellipsis (default 6+4)', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(formatWalletAddress(addr)).toBe('0x1234...5678');
  });

  it('respects custom startLength and endLength', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(formatWalletAddress(addr, 4, 6)).toBe('0x12...345678');
  });
});

describe('formatCryptoPrice', () => {
  it('returns "0" for zero', () => {
    expect(formatCryptoPrice(0)).toBe('0');
  });

  it('formats price >= 1 with 4 decimals', () => {
    expect(formatCryptoPrice(1)).toBe('1.0000');
    expect(formatCryptoPrice(123.456789)).toBe('123.4568');
  });

  it('formats price >= 0.001 with 6 decimals', () => {
    expect(formatCryptoPrice(0.5)).toBe('0.500000');
    expect(formatCryptoPrice(0.01303)).toBe('0.013030');
  });

  it('formats very small numbers with subscript when leading zeros >= 4', () => {
    const result = formatCryptoPrice(0.00007466);
    expect(result).toMatch(/^0\.0[₀-₉]+7466$/);
  });

  it('formats very small numbers without subscript when leading zeros < 4', () => {
    expect(formatCryptoPrice(0.001)).toBe('0.001000');
    // 0.0005: 3 leading zeros, toFixed(3+4) = 7 decimals
    expect(formatCryptoPrice(0.0005)).toBe('0.0005000');
  });

  it('respects minZerosToCollapse option', () => {
    const price = 0.00001234;
    // 4 leading zeros; with minZerosToCollapse: 5 we don't use subscript, use toFixed(4+4)
    expect(formatCryptoPrice(price, { minZerosToCollapse: 5 })).toBe('0.00001234');
    // with minZerosToCollapse: 3, 4 >= 3 so use subscript notation
    expect(formatCryptoPrice(price, { minZerosToCollapse: 3 })).toMatch(/^0\.0[₀-₉]+123/);
  });

  it('respects significantDigits option', () => {
    const price = 0.00007466123;
    const result = formatCryptoPrice(price, { significantDigits: 2 });
    expect(result).toMatch(/^0\.0[₀-₉]+74$/);
  });
});
