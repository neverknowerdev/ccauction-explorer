import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import { countBidsForAuction, getAuctionById, type AuctionLinksJson, type AuctionTokenInfoJson } from '@/lib/db/queries';
import { getCurrencyDecimals } from '@/lib/currencies';
import type { AuctionDetail } from '@/lib/auctions/types';

type SupplyInfoJson = {
  totalSupply?: string;
  auctionAmount?: string;
  poolAmount?: string;
  ownerRetained?: string;
} | null;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toTokenAmount(value: unknown, decimals: number): number | null {
  if (value == null) return null;
  const valueString = typeof value === 'string' ? value : String(value);
  if (valueString.trim() === '') return null;
  try {
    const divisor = new Decimal(10).pow(decimals);
    return new Decimal(valueString).div(divisor).toNumber();
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auctionId = Number(params.id);
  if (!Number.isFinite(auctionId)) {
    return NextResponse.json({ error: 'Invalid auction id' }, { status: 400 });
  }

  const auctionRow = await getAuctionById(auctionId);
  if (!auctionRow) {
    return NextResponse.json({ auction: null }, { status: 404 });
  }

  const totalBids = await countBidsForAuction(auctionId);

  const token = (auctionRow.tokenInfo ?? null) as AuctionTokenInfoJson | null;
  const links = (auctionRow.links ?? null) as AuctionLinksJson | null;
  const supplyInfo = (auctionRow.supplyInfo ?? null) as SupplyInfoJson;
  const tokenDecimals = token?.decimals ?? 18;

  const floorPrice = toNumber(auctionRow.floorPrice);
  const currentClearingPrice = toNumber(auctionRow.currentClearingPrice);
  const derivedMaxBidPrice = currentClearingPrice || floorPrice || null;

  const auctionAddress = (auctionRow as { address: string }).address;
  const currencyAddress = auctionRow.currency ?? null;
  const currencyDecimals = getCurrencyDecimals(currencyAddress);
  const detail: AuctionDetail = {
    id: auctionRow.id,
    chainId: auctionRow.chainId,
    chainName: auctionRow.chainName ?? null,
    address: auctionAddress,
    currencyAddress,
    currencyDecimals,
    tokenTicker: token?.symbol ?? null,
    tokenName: token?.name ?? null,
    tokenImage: token?.icon ?? token?.logo ?? null,
    status: auctionRow.status,
    startTime: auctionRow.startTime ? auctionRow.startTime.toISOString() : null,
    endTime: auctionRow.endTime ? auctionRow.endTime.toISOString() : null,
    currentPrice: currentClearingPrice ?? floorPrice,
    raised: toNumber(auctionRow.collectedAmount),
    target: toNumber(auctionRow.targetAmount),
    bidders: totalBids,
    currency: auctionRow.currencyName ?? auctionRow.currency ?? null,
    tokenDescription: token?.description ?? null,
    tokenWebsite: links?.Website ?? links?.website ?? null,
    tokenDecimals: tokenDecimals ?? null,
    supplyInfo: supplyInfo ? {
      totalSupply: toTokenAmount(supplyInfo.totalSupply, tokenDecimals) ?? 0,
      auctionSupply: toTokenAmount(supplyInfo.auctionAmount, tokenDecimals) ?? 0,
      poolSupply: toTokenAmount(supplyInfo.poolAmount, tokenDecimals) ?? 0,
      creatorRetained: toTokenAmount(supplyInfo.ownerRetained, tokenDecimals) ?? 0,
    } : null,
    floorPrice,
    currentClearingPrice,
    maxBidPrice: derivedMaxBidPrice,
    extraFundsDestination: auctionRow.extraFundsDestination ?? null,
    bids: [],
  };

  return NextResponse.json({ auction: detail });
}
