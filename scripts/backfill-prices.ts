/**
 * Backfill stored prices from raw processed_logs values.
 *
 * Recalculates:
 * - auctions.floor_price (from AuctionCreated configData floorPrice)
 * - auctions.current_clearing_price (from latest ClearingPriceUpdated event)
 * - bids.max_price (from BidSubmitted event price)
 * - clearing_price_history.clearing_price (from ClearingPriceUpdated event)
 *
 * Usage:
 *   yarn backfill-prices
 *   yarn backfill-prices --dry-run
 *   yarn backfill-prices --auction-id 323
 *   yarn backfill-prices --auction-id 323 --dry-run
 */

import './helpers/load-env';
import postgres from 'postgres';
import type { Hex } from 'viem';
import { decodeAuctionConfig } from '../lib/auction/fetcher';
import { getCurrencyDecimals } from '../lib/currencies';
import { q96ToPrice } from '../utils/format';

type CliOptions = {
  dryRun: boolean;
  auctionId: number | null;
};

type AuctionRow = {
  id: number;
  chain_id: number;
  address: string;
  currency: string | null;
  token_info: unknown;
  processed_log_id: number | null;
  floor_price: string | null;
  current_clearing_price: string | null;
};

type BidRow = {
  auction_id: number;
  bid_id: string;
  max_price: string;
  currency: string | null;
  token_info: unknown;
  params: Record<string, unknown> | null;
};

type ClearingPriceHistoryRow = {
  id: number;
  clearing_price: string;
  currency: string | null;
  token_info: unknown;
  params: Record<string, unknown> | null;
};

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  let dryRun = false;
  let auctionId: number | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--auction-id') {
      const value = args[i + 1];
      if (value == null) {
        throw new Error('--auction-id requires a numeric value');
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid --auction-id value: ${value}`);
      }
      auctionId = parsed;
      i += 1;
      continue;
    }
  }

  return { dryRun, auctionId };
}

function getTokenDecimals(tokenInfo: unknown): number {
  if (tokenInfo == null || typeof tokenInfo !== 'object' || Array.isArray(tokenInfo)) {
    return 18;
  }
  const decimals = (tokenInfo as { decimals?: unknown }).decimals;
  if (typeof decimals === 'number' && Number.isFinite(decimals)) {
    return decimals;
  }
  if (typeof decimals === 'string' && decimals.trim() !== '') {
    const parsed = Number(decimals);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 18;
}

function toStringValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function getRawBidPrice(params: Record<string, unknown> | null): string | null {
  if (!params) return null;
  return (
    toStringValue(params.price) ??
    toStringValue(params.param2) ??
    toStringValue(params['2']) ??
    null
  );
}

function getRawClearingPrice(params: Record<string, unknown> | null): string | null {
  if (!params) return null;
  return (
    toStringValue(params.clearingPrice) ??
    toStringValue(params.param1) ??
    toStringValue(params['1']) ??
    null
  );
}

function decodeRawFloorPriceFromAuctionCreatedParams(
  params: Record<string, unknown> | null
): string | null {
  if (!params) return null;
  const configData = toStringValue(params.configData);
  if (!configData || !configData.startsWith('0x')) return null;
  try {
    const decoded = decodeAuctionConfig(configData as Hex);
    return decoded.params.floorPrice.toString();
  } catch {
    return null;
  }
}

async function main() {
  const options = parseCliOptions();
  const connectionString = process.env.DB_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('DB_CONNECTION_STRING is not set');
  }

  const sql = postgres(connectionString);

  console.log('='.repeat(60));
  console.log('Backfill Prices');
  console.log('='.repeat(60));
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no writes)' : 'WRITE'}`);
  console.log(`Auction filter: ${options.auctionId ?? 'all'}`);
  console.log('');

  const auctions = await sql<AuctionRow[]>`
    select
      a.id,
      a.chain_id,
      a.address,
      a.currency,
      a.token_info,
      a.processed_log_id,
      a.floor_price,
      a.current_clearing_price
    from auctions a
    where ${options.auctionId == null ? sql`true` : sql`a.id = ${options.auctionId}`}
    order by a.id asc
  `;

  let auctionsUpdated = 0;
  let auctionFloorUpdated = 0;
  let auctionCurrentUpdated = 0;
  let auctionMissingClearingLog = 0;

  for (const auction of auctions) {
    const tokenDecimals = getTokenDecimals(auction.token_info);
    const currencyDecimals = getCurrencyDecimals(auction.currency);

    if (auction.processed_log_id == null) {
      throw new Error(
        `Auction ${auction.id} (${auction.address}) has null processed_log_id; expected AuctionCreated processed log`
      );
    }

    const createdLogRows = await sql<{ params: Record<string, unknown> | null }[]>`
      select pl.params
      from processed_logs pl
      where pl.id = ${auction.processed_log_id}
      limit 1
    `;
    if (createdLogRows.length === 0) {
      throw new Error(
        `Auction ${auction.id} (${auction.address}) processed_log_id=${auction.processed_log_id} not found in processed_logs`
      );
    }

    const rawFloorPrice = decodeRawFloorPriceFromAuctionCreatedParams(createdLogRows[0]?.params ?? null);
    if (rawFloorPrice == null) {
      throw new Error(
        `Auction ${auction.id} (${auction.address}) processed_log_id=${auction.processed_log_id} has invalid/missing AuctionCreated configData floorPrice`
      );
    }

    const latestClearingRows = await sql<{ params: Record<string, unknown> | null }[]>`
      select pl.params
      from processed_logs pl
      left join event_topics et on et.id = pl.event_topic_id
      where pl.chain_id = ${auction.chain_id}
        and et.event_name = 'ClearingPriceUpdated'
        and lower(pl.contract_address) = lower(${auction.address})
      order by pl.block_number desc, pl.log_index desc
      limit 1
    `;

    const rawCurrentClearingPrice = getRawClearingPrice(latestClearingRows[0]?.params ?? null);

    const nextFloorPrice = q96ToPrice(rawFloorPrice, tokenDecimals, currencyDecimals);
    const nextCurrentClearingPrice =
      rawCurrentClearingPrice == null
        ? null
        : q96ToPrice(rawCurrentClearingPrice, tokenDecimals, currencyDecimals);

    if (rawCurrentClearingPrice == null) auctionMissingClearingLog += 1;

    const shouldUpdateFloor = nextFloorPrice !== auction.floor_price;
    const shouldUpdateCurrent = nextCurrentClearingPrice !== auction.current_clearing_price;

    if (shouldUpdateFloor || shouldUpdateCurrent) {
      auctionsUpdated += 1;
      if (shouldUpdateFloor) auctionFloorUpdated += 1;
      if (shouldUpdateCurrent) auctionCurrentUpdated += 1;

      if (!options.dryRun) {
        await sql`
          update auctions
          set
            floor_price = ${nextFloorPrice},
            current_clearing_price = ${nextCurrentClearingPrice},
            updated_at = now()
          where id = ${auction.id}
        `;
      }
    }
  }

  const bids = await sql<BidRow[]>`
    select
      b.auction_id,
      b.bid_id::text as bid_id,
      b.max_price::text as max_price,
      a.currency,
      a.token_info,
      pl.params
    from bids b
    inner join auctions a on a.id = b.auction_id
    left join processed_logs pl on pl.id = b.processed_log_id
    where ${options.auctionId == null ? sql`true` : sql`b.auction_id = ${options.auctionId}`}
    order by b.auction_id asc
  `;

  let bidsUpdated = 0;
  let bidsMissingRawPrice = 0;

  for (const bid of bids) {
    const rawPrice = getRawBidPrice(bid.params);
    if (rawPrice == null) {
      bidsMissingRawPrice += 1;
      continue;
    }

    const tokenDecimals = getTokenDecimals(bid.token_info);
    const currencyDecimals = getCurrencyDecimals(bid.currency);
    const nextMaxPrice = q96ToPrice(rawPrice, tokenDecimals, currencyDecimals);

    if (nextMaxPrice !== bid.max_price) {
      bidsUpdated += 1;
      if (!options.dryRun) {
        await sql`
          update bids
          set max_price = ${nextMaxPrice}
          where auction_id = ${bid.auction_id}
            and bid_id = ${bid.bid_id}::numeric
        `;
      }
    }
  }

  const clearingRows = await sql<ClearingPriceHistoryRow[]>`
    select
      cph.id,
      cph.clearing_price::text as clearing_price,
      a.currency,
      a.token_info,
      pl.params
    from clearing_price_history cph
    inner join auctions a on a.id = cph.auction_id
    left join processed_logs pl on pl.id = cph.processed_log_id
    where ${options.auctionId == null ? sql`true` : sql`cph.auction_id = ${options.auctionId}`}
    order by cph.id asc
  `;

  let clearingUpdated = 0;
  let clearingMissingRawPrice = 0;

  for (const row of clearingRows) {
    const rawPrice = getRawClearingPrice(row.params);
    if (rawPrice == null) {
      clearingMissingRawPrice += 1;
      continue;
    }

    const tokenDecimals = getTokenDecimals(row.token_info);
    const currencyDecimals = getCurrencyDecimals(row.currency);
    const nextClearingPrice = q96ToPrice(rawPrice, tokenDecimals, currencyDecimals);

    if (nextClearingPrice !== row.clearing_price) {
      clearingUpdated += 1;
      if (!options.dryRun) {
        await sql`
          update clearing_price_history
          set clearing_price = ${nextClearingPrice}
          where id = ${row.id}
        `;
      }
    }
  }

  console.log('');
  console.log('Completed.');
  console.log(`Auctions scanned: ${auctions.length}`);
  console.log(`  Auctions updated: ${auctionsUpdated}`);
  console.log(`    floor_price updated: ${auctionFloorUpdated}`);
  console.log(`    current_clearing_price updated: ${auctionCurrentUpdated}`);
  console.log(`  Auctions missing ClearingPriceUpdated raw: ${auctionMissingClearingLog}`);
  console.log(`Bids scanned: ${bids.length}`);
  console.log(`  Bids updated: ${bidsUpdated}`);
  console.log(`  Bids missing raw price: ${bidsMissingRawPrice}`);
  console.log(`Clearing history scanned: ${clearingRows.length}`);
  console.log(`  Clearing history updated: ${clearingUpdated}`);
  console.log(`  Clearing history missing raw price: ${clearingMissingRawPrice}`);

  await sql.end();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
