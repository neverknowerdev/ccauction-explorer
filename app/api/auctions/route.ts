import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';
import {
  getAuctionStats,
  listPlannedAuctions,
  listActiveAndEndedAuctions,
  type AuctionTokenInfoJson,
} from '@/lib/db/queries';
import type { AuctionListItem } from '@/lib/auctions/types';
import { getChainTitle } from '@/lib/chains';

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type SupplyInfoJson = {
  totalSupply?: string;
} | null;

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

function calculateFdv(totalSupply: number | null, price: number | null): number | null {
  if (totalSupply == null || price == null) return null;
  const fdv = totalSupply * price;
  return Number.isFinite(fdv) ? fdv : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const aboveThresholdParam = searchParams.get('above_threshold');
  const aboveThresholdOnly = aboveThresholdParam !== 'all' && aboveThresholdParam !== '0' && aboveThresholdParam !== 'false';

  const [plannedRows, activeAndEndedRows, stats] = await Promise.all([
    listPlannedAuctions(10),
    listActiveAndEndedAuctions(10, aboveThresholdOnly),
    getAuctionStats(true),
  ]);

  const mapRowToAuction = (row: (typeof plannedRows)[number]): AuctionListItem => {
    const token = (row.tokenInfo ?? null) as AuctionTokenInfoJson | null;
    const supplyInfo = (row.supplyInfo ?? null) as SupplyInfoJson;
    const tokenDecimals = token?.decimals ?? 18;
    const totalSupply = toTokenAmount(supplyInfo?.totalSupply, tokenDecimals);
    const floorPrice = toNumber(row.floorPrice);
    const currentClearingPrice = toNumber(row.currentClearingPrice);
    const currentPrice = toNumber(row.currentClearingPrice) ?? toNumber(row.floorPrice);

    return {
      id: row.id,
      chainId: row.chainId,
      chainName: getChainTitle(row.chainId) ?? row.chainName ?? null,
      tokenTicker: token?.symbol ?? null,
      tokenName: token?.name ?? null,
      tokenImage: token?.icon ?? token?.logo ?? null,
      status: row.status,
      startTime: row.startTime ? row.startTime.toISOString() : null,
      endTime: row.endTime ? row.endTime.toISOString() : null,
      currentPrice,
      raised: toNumber(row.collectedAmount),
      target: toNumber(row.targetAmount),
      bidders: Number(row.bidsCount ?? 0),
      currency: row.currencyName ?? row.currency ?? null,
      minimumFdv: calculateFdv(totalSupply, floorPrice),
      currentFdv: calculateFdv(totalSupply, currentClearingPrice),
    };
  };

  const plannedAuctions: AuctionListItem[] = plannedRows.map(mapRowToAuction);
  const activeAndEndedAuctions: AuctionListItem[] = activeAndEndedRows.map(mapRowToAuction);
  const activeAuctions: AuctionListItem[] = activeAndEndedAuctions.filter((a) => a.status === 'active');
  const endedAuctions: AuctionListItem[] = activeAndEndedAuctions.filter(
    (a) => a.status === 'ended' || a.status === 'claimable' || a.status === 'graduated'
  );

  console.log('stats', stats);

  return NextResponse.json({
    plannedAuctions,
    activeAuctions,
    endedAuctions,
    stats,
  });
}
