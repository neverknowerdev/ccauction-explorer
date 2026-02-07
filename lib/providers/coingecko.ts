/**
 * CoinGecko Demo API — token metadata (website, socials, description, image, categories) by contract address.
 * Free tier: get a Demo API key from https://www.coingecko.com/en/developers/dashboard.
 * No paid plan required.
 */

import type { Address } from 'viem';
import pRetry from 'p-retry';
import type { EtherscanTokenInfo } from './etherscan';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const REQUEST_TIMEOUT_MS = 5_000;

/** Retry on server/rate-limit errors; 404 is valid (no retry). */
const COINGECKO_RETRY_OPTIONS = {
  retries: 3,
  minTimeout: 1000,
  maxTimeout: 5000,
};

/** Extended token info from CoinGecko (links + description, image, categories). */
export interface CoinGeckoTokenInfo extends EtherscanTokenInfo {
  tokenName: string | null;
  tokenSymbol: string | null;
  description: string | null;
  image: string | null;
  icon: string | null;
  logo: string | null;
  categories: string[];
}

/** CoinGecko asset platform ID per chain. Testnets may not be supported. */
const CHAIN_TO_PLATFORM: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum-one',
  // 84532: 'base-sepolia' — not in CoinGecko asset platforms
};

interface CoinGeckoLinks {
  homepage?: string[];
  whitepaper?: string;
  twitter_screen_name?: string;
  chat_url?: string[];
  telegram_channel_identifier?: string;
  subreddit_url?: string;
  repos_url?: { github?: string[] };
  facebook_username?: string;
  announcement_url?: string[];
}

interface CoinGeckoCoinResponse {
  id?: string;
  name?: string;
  symbol?: string;
  links?: CoinGeckoLinks;
  description?: { en?: string };
  image?: { thumb?: string; small?: string; large?: string };
  categories?: string[];
  [key: string]: unknown;
}

interface CoinGeckoSimplePriceResponse {
  ethereum?: { usd?: number };
}

function buildHeaders(): HeadersInit {
  const apiKey = process.env.COINGECKO_DEMO_API_KEY;
  return apiKey ? { 'x-cg-demo-api-key': apiKey } : {};
}

function firstString(arr: string[] | undefined): string | null {
  if (!Array.isArray(arr)) return null;
  const s = arr.find((x) => typeof x === 'string' && x.trim() !== '');
  return s && s.trim() ? s.trim() : null;
}

function toNull(s: string | undefined | null): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

/**
 * Fetch token metadata (website, socials, description, image, categories) from CoinGecko by contract address.
 * Uses the free Demo API: set COINGECKO_DEMO_API_KEY in .env.local (get one at
 * https://www.coingecko.com/en/developers/dashboard).
 */
export async function getTokenInfo(
  contractAddress: Address,
  chainId: number,
): Promise<CoinGeckoTokenInfo | null> {
  const platformId = CHAIN_TO_PLATFORM[chainId];
  if (!platformId) return null;

  const url = `${COINGECKO_API}/coins/${platformId}/contract/${contractAddress.toLowerCase()}`;

  let response: Response;
  try {
    response = await pRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(url, {
          headers: buildHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok && res.status !== 404) {
          throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
        }
        return res;
      },
      COINGECKO_RETRY_OPTIONS,
    );
  } catch {
    return null;
  }

  if (!response.ok) {
    if (response.status === 404) return null;
    return null;
  }

  try {
    const data = (await response.json()) as CoinGeckoCoinResponse;

    const links = data.links;
    const website =
      links && typeof links === 'object'
        ? firstString(links.homepage) ?? null
        : null;
    const twitterHandle = links?.twitter_screen_name != null ? toNull(links.twitter_screen_name) : null;
    const twitter = twitterHandle ? `https://twitter.com/${twitterHandle.replace(/^@/, '')}` : null;

    const chatUrls = Array.isArray(links?.chat_url) ? links.chat_url : [];
    let discord: string | null = null;
    let telegram: string | null = null;
    for (const u of chatUrls) {
      if (typeof u !== 'string' || !u) continue;
      const lower = u.toLowerCase();
      if (lower.includes('discord')) discord = u.trim();
      else if (lower.includes('telegram')) telegram = u.trim();
    }
    if (!telegram && links?.telegram_channel_identifier) {
      const id = String(links.telegram_channel_identifier).trim();
      if (id) telegram = `https://t.me/${id.replace(/^@/, '')}`;
    }

    const github = links?.repos_url?.github != null ? firstString(links.repos_url.github) ?? null : null;
    const reddit = links?.subreddit_url != null ? toNull(links.subreddit_url) : null;
    const facebook =
      links?.facebook_username != null
        ? `https://www.facebook.com/${String(links.facebook_username).trim()}`
        : null;
    const blog = links?.announcement_url != null ? firstString(links.announcement_url) ?? null : null;
    const linkedin: string | null = null;
    const whitepaper = links?.whitepaper != null ? toNull(links.whitepaper) ?? null : null;

    const description =
      data.description?.en != null ? toNull(String(data.description.en).replace(/<[^>]*>/g, '').trim()) : null;
    const icon = data.image?.thumb ?? data.image?.small ?? null;
    const logo = data.image?.large ?? data.image?.small ?? data.image?.thumb ?? null;
    const image = logo ?? icon ?? null;
    const categories = Array.isArray(data.categories)
      ? data.categories.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
      : [];
    const tokenName = toNull(data.name);
    const tokenSymbol = toNull(data.symbol)?.toUpperCase() ?? null;

    const linkFields: EtherscanTokenInfo = {
      website,
      twitter,
      discord,
      telegram,
      github,
      reddit,
      facebook,
      blog,
      linkedin,
      whitepaper,
    };
    const hasAnyLink = Object.values(linkFields).some((v) => v != null && v !== '');
    const hasAnyExtra =
      description != null ||
      image != null ||
      icon != null ||
      logo != null ||
      categories.length > 0 ||
      tokenName != null ||
      tokenSymbol != null;
    if (!hasAnyLink && !hasAnyExtra) return null;

    return {
      ...linkFields,
      tokenName,
      tokenSymbol,
      description,
      image,
      icon,
      logo,
      categories,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch ETH/USD price using CoinGecko simple price endpoint.
 */
export async function getEthUsdPrice(): Promise<number | null> {
  const url = `${COINGECKO_API}/simple/price?ids=ethereum&vs_currencies=usd`;

  let response: Response;
  try {
    response = await pRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(url, {
          headers: buildHeaders(),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok && res.status !== 404) {
          throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
        }
        return res;
      },
      COINGECKO_RETRY_OPTIONS,
    );
  } catch {
    return null;
  }

  if (!response.ok) {
    if (response.status === 404) return null;
    return null;
  }

  try {
    const data = (await response.json()) as CoinGeckoSimplePriceResponse;
    const usd = data?.ethereum?.usd;
    return typeof usd === 'number' && Number.isFinite(usd) ? usd : null;
  } catch {
    return null;
  }
}
