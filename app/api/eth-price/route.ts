import { NextResponse } from 'next/server';
import { getLatestEthPrice } from '@/lib/db/queries';

const TEN_MINUTES_SECONDS = 600;

function toFiniteNumber(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  try {
    const latest = await getLatestEthPrice();
    return NextResponse.json(
      { ethPriceUsd: toFiniteNumber(latest) },
      {
        headers: {
          // Cache ETH price for 10 minutes on browser and shared caches.
          'Cache-Control': `public, max-age=${TEN_MINUTES_SECONDS}, s-maxage=${TEN_MINUTES_SECONDS}, stale-while-revalidate=60`,
        },
      }
    );
  } catch {
    return NextResponse.json({ ethPriceUsd: null }, { status: 500 });
  }
}
