/**
 * Handle AuctionCreated event
 * - Create new auction in DB with status='created'
 * - Fetch full auction info from creation tx, source code hash, and update DB
 */

import { eq } from 'drizzle-orm';
import { db, auctions } from '@/lib/db';
import {
  fetchAuctionInfoFromTx,
  getContractSourceCodeHash,
  isChainSupported,
} from '@/lib/auction';
import type { AuctionInfo } from '@/lib/auction/fetcher';
import { getCurrencyName, getCurrencyDecimals, currencyAmountToHuman } from '@/lib/currencies';
import { q96ToPrice } from '@/utils/format';
import type { EventContext } from '../types';
import { missingParamsError } from '../errors';
import { getTokenInfo, type CoinGeckoTokenInfo } from '@/lib/providers';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function buildTokenInfoJson(info: AuctionInfo, meta: CoinGeckoTokenInfo | null) {
  return {
    address: info.tokenAddress,
    name: info.tokenName,
    symbol: info.tokenSymbol,
    decimals: info.tokenDecimals,
    totalSupply: info.tokenTotalSupply.toString(),
    icon: meta?.icon ?? null,
    logo: meta?.logo ?? null,
    description: meta?.description ?? null,
    categories: meta?.categories && meta.categories.length > 0 ? meta.categories : null,
  };
}

function buildSupplyInfoJson(info: AuctionInfo) {
  return {
    totalSupply: info.tokenSupplyInfo.totalSupply.toString(),
    totalDistributed: info.tokenSupplyInfo.totalDistributed.toString(),
    auctionAmount: info.tokenSupplyInfo.auctionAmount.toString(),
    poolAmount: info.tokenSupplyInfo.poolAmount.toString(),
    ownerRetained: info.tokenSupplyInfo.ownerRetained.toString(),
    auctionPercent: info.tokenSupplyInfo.auctionPercent,
    poolPercent: info.tokenSupplyInfo.poolPercent,
    ownerPercent: info.tokenSupplyInfo.ownerPercent,
    tokenMintInfo: info.tokenMintInfo,
  };
}

function buildLinksJson(meta: CoinGeckoTokenInfo | null): Record<string, string> | null {
  if (!meta) return null;
  const mapping: Record<string, keyof CoinGeckoTokenInfo> = {
    Website: 'website',
    Twitter: 'twitter',
    Discord: 'discord',
    Telegram: 'telegram',
    GitHub: 'github',
    Reddit: 'reddit',
    Facebook: 'facebook',
    Blog: 'blog',
    LinkedIn: 'linkedin',
    Whitepaper: 'whitepaper',
  };
  const links: Record<string, string> = {};
  for (const [label, key] of Object.entries(mapping)) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim() !== '') {
      links[label] = value.trim();
    }
  }
  return Object.keys(links).length > 0 ? links : null;
}

function isStablecoin(categories: string[] | null | undefined): boolean {
  if (!categories || categories.length === 0) return false;
  return categories.some((c) => c.toLowerCase().includes('stablecoin'));
}

export async function handleAuctionCreated(ctx: EventContext): Promise<void> {
  // AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)
  const auctionAddress = (
    (ctx.params.auction as string) ??
    (ctx.params[0] as string)
  )?.toLowerCase();
  const tokenAddress = (
    (ctx.params.token as string) ??
    (ctx.params[1] as string)
  )?.toLowerCase();

  if (!auctionAddress) {
    throw missingParamsError('AuctionCreated', ctx.params);
  }

  // Insert auction with ON CONFLICT DO NOTHING
  const inserted = await db
    .insert(auctions)
    .values({
      chainId: ctx.chainId,
      address: auctionAddress,
      status: 'created',
      tokenInfo: tokenAddress ? { address: tokenAddress } : null,
      processedLogId: ctx.processedLogId,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    })
    .onConflictDoNothing({
      target: [auctions.chainId, auctions.address],
    })
    .returning({ id: auctions.id });

  if (inserted.length === 0) {
    console.log(`AuctionCreated: auction already exists (chain=${ctx.chainId}, address=${auctionAddress})`);
    return;
  }

  const auctionId = inserted[0].id;
  console.log(`AuctionCreated: created auction id=${auctionId} address=${auctionAddress}`);

  if (!isChainSupported(ctx.chainId)) return;

  try {
    // RPC: tx, receipt, block, token reads — usually 1–3s
    const info = await fetchAuctionInfoFromTx(ctx.transactionHash as `0x${string}`, ctx.chainId);
    const currencyAddress = (info.parameters.currency ?? ZERO_ADDRESS).toLowerCase();

    // Run external APIs in parallel so we wait for the slowest, not the sum (saves ~5–15s)
    const [tokenMeta, currencyMeta, sourceCodeHashResult] = await Promise.all([
      getTokenInfo(info.tokenAddress, info.chainId),
      currencyAddress === ZERO_ADDRESS ? Promise.resolve(null) : getTokenInfo(currencyAddress as `0x${string}`, info.chainId),
      getContractSourceCodeHash(auctionAddress as `0x${string}`, ctx.chainId).catch(() => null),
    ]);

    const tokenInfoJson = buildTokenInfoJson(info, tokenMeta);
    const linksJson = buildLinksJson(tokenMeta);
    const supplyInfoJson = buildSupplyInfoJson(info);

    let currencyName = getCurrencyName(info.parameters.currency);
    let isCurrencyStablecoin = false;
    if (currencyAddress !== ZERO_ADDRESS && currencyMeta) {
      if (currencyName === 'Unknown') {
        currencyName =
          currencyMeta?.tokenSymbol ??
          currencyMeta?.tokenName ??
          currencyName;
      }
      isCurrencyStablecoin = isStablecoin(currencyMeta?.categories);
    }

    const sourceCodeHash = sourceCodeHashResult;

    // Convert targetAmount from raw currency units to human-readable decimal
    // Use requiredCurrencyRaised which is the currency target, not auctionAmount (which is token quantity)
    const currencyDecimals = getCurrencyDecimals(info.parameters.currency);
    const targetAmount = currencyAmountToHuman(info.parameters.requiredCurrencyRaised, currencyDecimals);
    const floorPrice = q96ToPrice(info.parameters.floorPrice, info.tokenDecimals, currencyDecimals);

    // Convert auctionAmount (token quantity) using token decimals
    const auctionTokenSupply = currencyAmountToHuman(info.auctionAmount, info.tokenDecimals);

    await db
      .update(auctions)
      .set({
        status: info.auctionStatus,
        creatorAddress: info.from,
        factoryAddress: info.factoryAddress,
        validationHookAddress: info.parameters.validationHook,
        startTime: info.timeInfo.startTime,
        endTime: info.timeInfo.endTime,
        floorPrice,
        currentClearingPrice: null, // can be filled by later events
        targetAmount,
        auctionTokenSupply,
        currency: info.parameters.currency,
        currencyName,
        isCurrencyStablecoin,
        tokenInfo: tokenInfoJson,
        links: linksJson,
        supplyInfo: supplyInfoJson,
        auctionStepsRaw: info.auctionSteps,
        extraFundsDestination: info.extraFundsDestination,
        sourceCodeHash,
        updatedAt: new Date(),
      })
      .where(eq(auctions.id, auctionId));

    console.log(`AuctionCreated: updated auction id=${auctionId} with full info${sourceCodeHash ? ' and source_code_hash' : ''}`);
  } catch (error) {
    console.error(`AuctionCreated: failed to fetch auction info for ${auctionAddress}:`, error);
  }
}
