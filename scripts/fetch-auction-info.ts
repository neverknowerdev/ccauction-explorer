/**
 * Fetch auction information from a CCA (Continuous Clearing Auction) creation transaction
 *
 * Usage:
 *   yarn fetch-auction-info <txHash> [chainId]
 *
 * Examples:
 *   yarn fetch-auction-info 0x3ed244ce1b5ae114a17bd33da50857ec0e6d6b44caa44d049c13ec6e4c6c416d
 *   yarn fetch-auction-info 0x3b37030109a8b943357ecd6920e66fa42ad46547905d94eefd3c6193a4fb0414 1
 */

import type { Hex } from 'viem';
import { SUPPORTED_CHAINS, SUPPORTED_CHAIN_IDS } from '../lib/chains';
import { fetchAuctionInfoFromTx, printAuctionInfo } from '../lib/auction';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: yarn fetch-auction-info <txHash> [chainId]');
    console.log('');
    console.log('Chain IDs:');
    for (const id of SUPPORTED_CHAIN_IDS) {
      const c = SUPPORTED_CHAINS[id];
      console.log(`  ${id} - ${c.name} (~${c.blockTimeSeconds}s block time)`);
    }
    console.log('');
    console.log('Examples:');
    console.log('  yarn fetch-auction-info 0x3ed244ce1b5ae114a17bd33da50857ec0e6d6b44caa44d049c13ec6e4c6c416d 8453');
    console.log('  yarn fetch-auction-info 0x3b37030109a8b943357ecd6920e66fa42ad46547905d94eefd3c6193a4fb0414 1');
    process.exit(1);
  }

  const txHash = args[0] as Hex;
  const chainId = args[1] ? parseInt(args[1], 10) : 84532;

  if (!txHash.startsWith('0x') || txHash.length !== 66) {
    console.error('Invalid transaction hash format');
    process.exit(1);
  }

  const config = SUPPORTED_CHAINS[chainId];
  if (!config) {
    console.error(`Unsupported chain ID: ${chainId}`);
    console.error(`Supported: ${SUPPORTED_CHAIN_IDS.join(', ')}`);
    process.exit(1);
  }

  console.log(`\nFetching auction info for tx ${txHash} on ${config.name}...`);

  try {
    const info = await fetchAuctionInfoFromTx(txHash, chainId);
    printAuctionInfo(info, config.explorer);
  } catch (error) {
    console.error('\nError:', (error as Error).message);
    process.exit(1);
  }
}

main();
