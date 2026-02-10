/**
 * Refill missing auction info for already indexed auctions in DB.
 *
 * Usage:
 *   yarn refill-auction-info
 *
 * Examples:
 *   yarn refill-auction-info
 *
 * Notes:
 * - This checks existing auction rows for required fields and refills only incomplete rows.
 * - Refill uses creation tx from processed_logs and fetchAuctionInfoFromTx.
 * - Excluded from required checks:
 *   current_clearing_price, source_code_hash, collected_amount, collected_amount_usd, links
 */

// Must be first import so env is loaded before lib/db initialization.
import './helpers/load-env';
import type { Hex } from 'viem';
import { eq, and, inArray, ne } from 'drizzle-orm';
import { db, auctions, processedLogs } from '../lib/db';
import { fetchAuctionInfoFromTx, getContractSourceCodeHash } from '../lib/auction';
import { upsertAuctionFromInfo } from '../lib/log-processing';
import { createAlchemyClient } from '../lib/providers';
import { SUPPORTED_CHAIN_IDS } from '../lib/chains';

type AuctionRow = {
  id: number;
  chainId: number;
  address: string;
  processedLogId: number | null;
  startTime: Date | null;
  endTime: Date | null;
  creatorAddress: string | null;
  factoryAddress: string | null;
  validationHookAddress: string | null;
  tokenInfo: unknown;
  currency: string | null;
  currencyName: string | null;
  targetAmount: string | null;
  auctionTokenSupply: string | null;
  floorPrice: string | null;
  extraFundsDestination: 'pool' | 'creator' | null;
  supplyInfo: unknown;
  auctionStepsRaw: unknown;
};

type IncompleteAuction = {
  row: AuctionRow;
  missingFields: string[];
  txHash: string | null;
};

const AUCTION_CREATED_TOPICS = new Set([
  '0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9',
  '0x8a8cc462d00726e0f8c031dd2d6b9dcdf0794fb27a88579830dadee27d43ea7c',
]);

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === '';
}

function isMissingNumeric(value: string | number | null | undefined): boolean {
  if (value == null) return true;
  if (typeof value === 'number') return Number.isNaN(value);
  return value.trim() === '';
}

function hasRequiredTokenInfo(tokenInfo: unknown): { ok: boolean; missing: string[] } {
  if (!tokenInfo || typeof tokenInfo !== 'object' || Array.isArray(tokenInfo)) {
    return {
      ok: false,
      missing: ['token_info.address', 'token_info.name', 'token_info.symbol'],
    };
  }

  const info = tokenInfo as Record<string, unknown>;
  const missing: string[] = [];

  if (isBlank(typeof info.address === 'string' ? info.address : null)) {
    missing.push('token_info.address');
  }
  if (isBlank(typeof info.name === 'string' ? info.name : null)) {
    missing.push('token_info.name');
  }
  if (isBlank(typeof info.symbol === 'string' ? info.symbol : null)) {
    missing.push('token_info.symbol');
  }

  return { ok: missing.length === 0, missing };
}

function getMissingFields(row: AuctionRow): string[] {
  const missing: string[] = [];

  if (row.startTime == null) missing.push('start_time');
  if (row.endTime == null) missing.push('end_time');
  if (isBlank(row.creatorAddress)) missing.push('creator_address');
  if (isBlank(row.factoryAddress)) missing.push('factory_address');
  if (isBlank(row.validationHookAddress)) missing.push('validation_hook_address');

  const tokenCheck = hasRequiredTokenInfo(row.tokenInfo);
  if (!tokenCheck.ok) missing.push(...tokenCheck.missing);

  if (isBlank(row.currency)) missing.push('currency');
  if (isBlank(row.currencyName)) missing.push('currency_name');
  if (isMissingNumeric(row.targetAmount)) missing.push('target_amount');
  if (isMissingNumeric(row.auctionTokenSupply)) missing.push('auction_token_supply');
  if (isMissingNumeric(row.floorPrice)) missing.push('floor_price');
  if (row.extraFundsDestination == null) missing.push('extra_funds_destination');
  if (row.supplyInfo == null) missing.push('supply_info');
  if (row.auctionStepsRaw == null) missing.push('auction_steps_raw');

  return missing;
}

async function getAuctionsToCheck(): Promise<AuctionRow[]> {
  return db
    .select({
      id: auctions.id,
      chainId: auctions.chainId,
      address: auctions.address,
      processedLogId: auctions.processedLogId,
      startTime: auctions.startTime,
      endTime: auctions.endTime,
      creatorAddress: auctions.creatorAddress,
      factoryAddress: auctions.factoryAddress,
      validationHookAddress: auctions.validationHookAddress,
      tokenInfo: auctions.tokenInfo,
      currency: auctions.currency,
      currencyName: auctions.currencyName,
      targetAmount: auctions.targetAmount,
      auctionTokenSupply: auctions.auctionTokenSupply,
      floorPrice: auctions.floorPrice,
      extraFundsDestination: auctions.extraFundsDestination,
      supplyInfo: auctions.supplyInfo,
      auctionStepsRaw: auctions.auctionStepsRaw,
    })
    .from(auctions);
}

async function getTxHashByProcessedLogId(processedLogId: number): Promise<string | null> {
  const rows = await db
    .select({ txHash: processedLogs.transactionHash })
    .from(processedLogs)
    .where(eq(processedLogs.id, processedLogId))
    .limit(1);

  return rows[0]?.txHash ?? null;
}

async function getTxHashesByProcessedLogIds(processedLogIds: number[]): Promise<Map<number, string>> {
  if (processedLogIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: processedLogs.id,
      txHash: processedLogs.transactionHash,
    })
    .from(processedLogs)
    .where(inArray(processedLogs.id, processedLogIds));

  return new Map(rows.map(r => [r.id, r.txHash]));
}

function isTxNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Transaction with hash .* could not be found\./i.test(message);
}

function assertValidTxHash(txHash: string): asserts txHash is Hex {
  if (!txHash.startsWith('0x') || txHash.length !== 66) {
    throw new Error(`invalid transaction_hash format: ${txHash}`);
  }
}

async function detectAuctionCreatedTxChain(
  txHash: string,
  currentChainId: number
): Promise<number | null> {
  const chainsToCheck = [
    currentChainId,
    ...SUPPORTED_CHAIN_IDS.filter((id) => id !== currentChainId),
  ];

  for (const chainId of chainsToCheck) {
    try {
      const client = createAlchemyClient(chainId);
      const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
      const hasAuctionCreated = receipt.logs.some((log) => {
        const topic0 = log.topics[0]?.toLowerCase();
        return topic0 != null && AUCTION_CREATED_TOPICS.has(topic0);
      });
      if (hasAuctionCreated) return chainId;
    } catch {
      // tx not found on this chain (or RPC issue): continue probing other chains
    }
  }
  return null;
}

async function remapAuctionAndLogsChain(
  auctionId: number,
  auctionAddress: string,
  txHash: string,
  oldChainId: number,
  newChainId: number
): Promise<void> {
  if (oldChainId === newChainId) return;

  const conflict = await db
    .select({ id: auctions.id })
    .from(auctions)
    .where(
      and(
        eq(auctions.chainId, newChainId),
        eq(auctions.address, auctionAddress),
        ne(auctions.id, auctionId)
      )
    )
    .limit(1);
  if (conflict.length > 0) {
    throw new Error(
      `cannot remap auction ${auctionAddress} to chain ${newChainId}: same address already exists there`
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(processedLogs)
      .set({ chainId: newChainId })
      .where(
        and(
          eq(processedLogs.transactionHash, txHash),
          eq(processedLogs.chainId, oldChainId)
        )
      );

    await tx
      .update(auctions)
      .set({ chainId: newChainId })
      .where(eq(auctions.id, auctionId));
  });
}

async function refillAuctionFromTx(
  row: AuctionRow,
  txHash: string
): Promise<void> {
  assertValidTxHash(txHash);

  const info = await fetchAuctionInfoFromTx(txHash as Hex, row.chainId);

  let sourceCodeHash: string | null = null;
  try {
    sourceCodeHash = await getContractSourceCodeHash(info.auctionAddress, row.chainId);
  } catch {
    // Contract may not be verified on Etherscan
  }

  await upsertAuctionFromInfo(info, sourceCodeHash);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Refill Auction Info Script');
  console.log('='.repeat(60));
  console.log('Filtering by chain: all');
  console.log('');

  const allAuctions = await getAuctionsToCheck();
  console.log(`Auctions checked: ${allAuctions.length}`);

  const incompleteBase = allAuctions
    .map((row) => ({ row, missingFields: getMissingFields(row) }))
    .filter((entry) => entry.missingFields.length > 0);

  console.log(`Auctions with missing required fields: ${incompleteBase.length}`);
  if (incompleteBase.length === 0) {
    console.log('Nothing to refill.');
    return;
  }

  // Batch-load tx hashes (avoids N queries and enables batch chain detection)
  const processedLogIds = incompleteBase
    .map(({ row }) => row.processedLogId)
    .filter((id): id is number => id != null);
  const txByProcessedLogId = await getTxHashesByProcessedLogIds(processedLogIds);

  const incomplete: IncompleteAuction[] = incompleteBase.map((entry) => ({
    ...entry,
    txHash:
      entry.row.processedLogId != null
        ? txByProcessedLogId.get(entry.row.processedLogId) ?? null
        : null,
  }));

  // Phase 1: batch detect chains for tx hashes that are likely mapped to wrong chain
  console.log('\nDetecting possible chain mismatches by tx hash...');
  const txFirstOccurrence = new Map<string, { chainId: number; address: string }>();
  for (const item of incomplete) {
    if (!item.txHash) continue;
    if (!txFirstOccurrence.has(item.txHash)) {
      txFirstOccurrence.set(item.txHash, {
        chainId: item.row.chainId,
        address: item.row.address,
      });
    }
  }

  const txChainOverrides = new Map<string, number>();
  for (const [txHash, info] of txFirstOccurrence.entries()) {
    const detectedChain = await detectAuctionCreatedTxChain(txHash, info.chainId);
    if (detectedChain != null && detectedChain !== info.chainId) {
      txChainOverrides.set(txHash, detectedChain);
      console.log(
        `  Chain mismatch: tx ${txHash} from chain ${info.chainId} -> ${detectedChain} (${info.address})`
      );
    }
  }
  console.log(`Detected mismatched tx hashes: ${txChainOverrides.size}`);

  // Apply chain remaps once per auction
  let remappedAuctions = 0;
  for (const item of incomplete) {
    const { row, txHash } = item;
    if (!txHash) continue;
    const correctedChainId = txChainOverrides.get(txHash);
    if (correctedChainId == null || correctedChainId === row.chainId) continue;
    try {
      await remapAuctionAndLogsChain(
        row.id,
        row.address,
        txHash,
        row.chainId,
        correctedChainId
      );
      row.chainId = correctedChainId;
      remappedAuctions += 1;
    } catch (error) {
      console.error(
        `  Failed remap for ${row.address} tx ${txHash}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
  if (remappedAuctions > 0) {
    console.log(`Applied chain remaps for auctions: ${remappedAuctions}`);
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < incomplete.length; i += 1) {
    const item = incomplete[i];
    const { row, missingFields } = item;

    console.log('');
    console.log(`[${i + 1}/${incomplete.length}] Refill auction ${row.address} (chain ${row.chainId})`);
    console.log(`Missing: ${missingFields.join(', ')}`);

    try {
      if (row.processedLogId == null) {
        throw new Error('processed_log_id is null');
      }

      const txHash = item.txHash ?? await getTxHashByProcessedLogId(row.processedLogId);
      if (!txHash) {
        throw new Error(`transaction_hash not found for processed_log_id=${row.processedLogId}`);
      }
      await refillAuctionFromTx(row, txHash);
      success += 1;

    } catch (error) {
      failed += 1;
      if (isTxNotFoundError(error)) {
        console.error(
          `Refill failed for ${row.address} on chain ${row.chainId}: tx not found after chain-remap phase`
        );
      } else {
        console.error(
          `Refill failed for ${row.address} on chain ${row.chainId}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    // console.log('Debug mode: exiting after first processed auction.');
    // break;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Refill Completed');
  console.log(`  Total incomplete: ${incomplete.length}`);
  console.log(`  Refreshed: ${success}`);
  console.log(`  Failed: ${failed}`);
  console.log('='.repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
