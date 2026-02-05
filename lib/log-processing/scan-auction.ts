/**
 * Auction-specific scanning.
 * Scans all events for an auction contract from creation to latest block.
 * Uses fetchAuctionInfoFromAddress to determine creation block.
 */

import type { Hex } from 'viem';
import { fetchAuctionInfoFromAddress, getContractSourceCodeHash } from '@/lib/auction';
import { db, auctions } from '@/lib/db';
import type { AuctionInfo } from '@/lib/auction/fetcher';
import { getEstimatedBlockTimestamp } from '@/lib/chains';
import { getCurrencyName, getCurrencyDecimals, currencyAmountToHuman } from '@/lib/currencies';
import { q96ToHuman } from '@/utils/format';
import { createAlchemyClient, rawLogToViemLog } from '@/lib/providers';
import { processLogEntry, getCachedEventTopics } from './process-log-entry';
import type { RawLog, ScanResult } from './types';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Batch size for scanning a single contract (can be larger since we filter by address) */
const SCAN_BATCH_SIZE = 50_000;

// =============================================================================
// SAVE AUCTION INFO
// =============================================================================

function buildTokenJson(info: AuctionInfo) {
  return {
    address: info.tokenAddress,
    name: info.tokenName,
    symbol: info.tokenSymbol,
    decimals: info.tokenDecimals,
    totalSupply: info.tokenTotalSupply.toString(),
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

async function upsertAuctionFromInfo(info: AuctionInfo, sourceCodeHash: string | null = null): Promise<void> {
  const auctionAddress = info.auctionAddress.toLowerCase();
  const tokenJson = buildTokenJson(info);
  const supplyInfoJson = buildSupplyInfoJson(info);

  // Convert targetAmount from raw currency units to human-readable decimal
  // Use requiredCurrencyRaised which is the currency target, not auctionAmount (which is token quantity)
  const currencyDecimals = getCurrencyDecimals(info.parameters.currency);
  const targetAmount = currencyAmountToHuman(info.parameters.requiredCurrencyRaised, currencyDecimals);

  // Convert auctionAmount (token quantity) using token decimals
  const auctionTokenSupply = currencyAmountToHuman(info.auctionAmount, info.tokenDecimals);

  await db
    .insert(auctions)
    .values({
      chainId: info.chainId,
      address: auctionAddress,
      status: info.auctionStatus,
      creatorAddress: info.from,
      startTime: info.timeInfo.startTime,
      endTime: info.timeInfo.endTime,
      floorPrice: q96ToHuman(info.parameters.floorPrice),
      targetAmount,
      auctionTokenSupply,
      currency: info.parameters.currency,
      currencyName: getCurrencyName(info.parameters.currency),
      token: tokenJson,
      supplyInfo: supplyInfoJson,
      extraFundsDestination: info.extraFundsDestination,
      sourceCodeHash,
      createdAt: info.timestamp,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [auctions.chainId, auctions.address],
      set: {
        status: info.auctionStatus,
        creatorAddress: info.from,
        startTime: info.timeInfo.startTime,
        endTime: info.timeInfo.endTime,
        floorPrice: q96ToHuman(info.parameters.floorPrice),
        targetAmount,
        auctionTokenSupply,
        currency: info.parameters.currency,
        currencyName: getCurrencyName(info.parameters.currency),
        token: tokenJson,
        supplyInfo: supplyInfoJson,
        extraFundsDestination: info.extraFundsDestination,
        sourceCodeHash,
        updatedAt: new Date(),
      },
    });
}

// =============================================================================
// SCAN AUCTION (FORWARD FROM CREATION)
// =============================================================================

/**
 * Scan all events for an auction contract from creation to latest block.
 *
 * Algorithm:
 * 1. Fetch auction info from address (gets creation tx and block)
 * 2. Scan forward from creation block to latest, processing events in order
 * 3. Save auction info to DB after scan completes
 *
 * @param auctionAddress - The auction contract address
 * @param chainId - The chain ID where the auction is deployed
 * @param currentBlock - Optional. If provided, scan up to this block instead of latest.
 * @returns Scan result with counts of processed/skipped/errors
 */
export async function scanAuction(
  auctionAddress: string,
  chainId: number,
  currentBlock?: number
): Promise<ScanResult> {
  const normalizedAddress = auctionAddress.toLowerCase() as Hex;

  console.log('='.repeat(60));
  console.log(`Scanning Auction: ${normalizedAddress}`);
  console.log(`Chain: ${chainId}`);
  console.log('='.repeat(60));

  const client = createAlchemyClient(chainId);

  const auctionInfo = await fetchAuctionInfoFromAddress(normalizedAddress as `0x${string}`, chainId);
  const latestBlock = currentBlock ?? Number(auctionInfo.currentBlock);
  console.log(`${currentBlock ? 'Current' : 'Latest'} block: ${latestBlock}`);

  // Use creation block from auction info
  const startBlock = Number(auctionInfo.blockNumber);
  console.log(`Starting scan from block ${startBlock}`);

  // Load event topics for processing
  await getCachedEventTopics();

  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let totalBlocksScanned = 0;

  // Scan forward from start block
  let fromBlock = startBlock;

  while (fromBlock <= latestBlock) {
    const toBlock = Math.min(fromBlock + SCAN_BATCH_SIZE - 1, latestBlock);

    console.log(`\nScanning blocks ${fromBlock} - ${toBlock}...`);

    // Get logs for this chunk
    const rawLogs = await client.request({
      method: 'eth_getLogs',
      params: [{
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        address: normalizedAddress,
      }],
    }) as RawLog[];

    console.log(`  Found ${rawLogs.length} logs`);

    // Process logs in order (they come chronologically from eth_getLogs)
    for (const rawLog of rawLogs) {
      const log = rawLogToViemLog(rawLog);
      const blockNumber = Number(log.blockNumber);
      const blockTimestamp = getEstimatedBlockTimestamp(chainId, blockNumber);

      const result = await processLogEntry(log, {
        chainId,
        blockNumber,
        blockTimestamp,
        source: 'scanScript',
        verbose: false,
      });

      if (result.status === 'processed') totalProcessed++;
      else if (result.status === 'skipped') totalSkipped++;
      else totalErrors++;
    }

    totalBlocksScanned += toBlock - fromBlock + 1;

    // Continue forward
    fromBlock = toBlock + 1;
  }

  console.log('\n' + '='.repeat(60));
  console.log('Scan Complete');
  console.log(`  Blocks scanned: ${totalBlocksScanned}`);
  console.log(`  Processed: ${totalProcessed}`);
  console.log(`  Skipped: ${totalSkipped}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log('='.repeat(60));

  console.log('\nSaving auction info to DB...');
  let sourceCodeHash: string | null = null;
  try {
    sourceCodeHash = await getContractSourceCodeHash(normalizedAddress as `0x${string}`, chainId);
  } catch {
    // Contract may not be verified on Etherscan
  }
  await upsertAuctionFromInfo(auctionInfo, sourceCodeHash);
  console.log('Auction info saved.');

  return {
    processed: totalProcessed,
    skipped: totalSkipped,
    errors: totalErrors,
    blocksScanned: totalBlocksScanned,
  };
}
