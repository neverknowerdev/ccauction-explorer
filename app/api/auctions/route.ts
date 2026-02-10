import { NextResponse } from 'next/server';
import {
  getAuctionStats,
  listPlannedAuctions,
  listActiveAndEndedAuctions,
  type AuctionTokenInfoJson,
} from '@/lib/db/queries';
import type { AuctionListItem } from '@/lib/auctions/types';

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
    const currentPrice = toNumber(row.currentClearingPrice) ?? toNumber(row.floorPrice);

    return {
      id: row.id,
      chainId: row.chainId,
      chainName: row.chainName ?? null,
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
