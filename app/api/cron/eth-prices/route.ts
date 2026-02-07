/**
 * Cron Job: ETH Prices
 *
 * Fetches ETH/USD price from CoinGecko and stores it in eth_prices.
 *
 * Environment variables:
 *   CRON_SECRET - Secret to verify cron requests (optional but recommended)
 *   COINGECKO_DEMO_API_KEY - Optional CoinGecko demo API key
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, ethPrices } from '@/lib/db';
import { getEthUsdPrice } from '@/lib/providers';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  console.log('Cron: Fetching ETH prices');

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const priceUsd = await getEthUsdPrice();
    if (priceUsd == null) {
      console.warn('ETH Prices Cron: getEthUsdPrice() returned null (CoinGecko unreachable or invalid response)');
      return NextResponse.json(
        { success: false, error: 'ETH price unavailable', durationMs: Date.now() - startTime },
        { status: 502 }
      );
    }

    console.log('Cron: Inserting ETH price', priceUsd);
    await db.insert(ethPrices).values({
      timestamp: new Date(),
      price: priceUsd.toString(),
    });

    return NextResponse.json({
      success: true,
      priceUsd,
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
