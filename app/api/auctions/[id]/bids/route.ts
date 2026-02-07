import { NextResponse } from 'next/server';
import { listBidsForAuctionByAddress } from '@/lib/db/queries';
import type { AuctionBid } from '@/lib/auctions/types';

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function statusToFilledPercent(status: string): number {
  if (status === 'filled') return 100;
  if (status === 'partially_filled') return 50;
  return 0;
}

function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auctionId = Number(params.id);
  if (!Number.isFinite(auctionId)) {
    return NextResponse.json({ error: 'Invalid auction id' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  if (!wallet || !isValidAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const bidsRows = await listBidsForAuctionByAddress(auctionId, wallet);

  const bids: AuctionBid[] = bidsRows.map((bid) => ({
    id: bid.bidId.toString(),
    maxPrice: toNumber(bid.maxPrice),
    amount: toNumber(bid.amount),
    amountUsd: toNumber(bid.amountUsd),
    filledPercent: statusToFilledPercent(bid.status),
    isUserBid: true,
  }));

  return NextResponse.json({ bids });
}
