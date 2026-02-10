export function formatFdv(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function isEthCurrency(currency: string | null | undefined): boolean {
  if (!currency) return false;
  const normalized = currency.trim().toUpperCase();
  return normalized === 'ETH' || normalized === 'WETH' || normalized === 'NATIVE ETH';
}

function isUsdLikeCurrency(currency: string | null | undefined): boolean {
  if (!currency) return false;
  const normalized = currency.trim().toUpperCase();
  return normalized === 'USD' || normalized === 'USDC' || normalized === 'USDT' || normalized === 'DAI';
}

async function fetchLatestEthPriceUsd(): Promise<number | null> {
  try {
    const res = await fetch('/api/eth-price', { cache: 'default' });
    if (!res.ok) return null;
    const data = await res.json();
    const value = data?.ethPriceUsd;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function getLatestEthPriceUsdCached(): Promise<number | null> {
  // Cache TTL is controlled via HTTP headers on /api/eth-price.
  return fetchLatestEthPriceUsd();
}

export function convertFdvToUsd(
  fdvValue: number | null,
  currency: string | null | undefined,
  ethPriceUsd: number | null
): number | null {
  if (fdvValue == null || !Number.isFinite(fdvValue)) return null;
  if (isEthCurrency(currency)) {
    if (ethPriceUsd == null || !Number.isFinite(ethPriceUsd)) return null;
    return fdvValue * ethPriceUsd;
  }
  if (isUsdLikeCurrency(currency)) return fdvValue;
  return fdvValue;
}
