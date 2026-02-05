/**
 * Auction Scanner Script
 *
 * Scans all events for a specific auction contract from its creation block to the latest.
 * Uses Etherscan API to find contract creation block (fast), with fallback to eth_getLogs.
 * Works purely from blockchain data - no database lookup required to find start block.
 *
 * Usage:
 *   yarn scan-auction <auction-address> <chain-id>
 *
 * Examples:
 *   yarn scan-auction 0x1234...abcd 8453
 *   yarn scan-auction 0x1234...abcd 1
 *
 * Environment variables (from .env.local if present, then shell env):
 *   DB_CONNECTION_STRING - PostgreSQL connection string
 *   ALCHEMY_API_KEY - Alchemy API key for RPC access
 *   ETHERSCAN_API_KEY - Etherscan API key (optional, speeds up finding creation block)
 */

import './helpers/load-env';
import { scanAuction } from '../lib/log-processing';

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: yarn scan-auction <auction-address> <chain-id>');
    console.error('');
    console.error('Arguments:');
    console.error('  auction-address  The auction contract address (required)');
    console.error('  chain-id         The chain ID where the auction is deployed (required)');
    console.error('');
    console.error('Supported chains:');
    console.error('  1        - Ethereum Mainnet');
    console.error('  8453     - Base');
    console.error('  42161    - Arbitrum One');
    console.error('  84532    - Base Sepolia');
    console.error('  11155111 - Ethereum Sepolia');
    process.exit(1);
  }

  const auctionAddress = args[0];
  const chainId = parseInt(args[1], 10);

  if (!auctionAddress.startsWith('0x') || auctionAddress.length !== 42) {
    console.error('Error: Invalid auction address format. Expected 0x followed by 40 hex characters.');
    process.exit(1);
  }

  if (Number.isNaN(chainId)) {
    console.error('Error: Invalid chain ID. Expected a number.');
    process.exit(1);
  }

  try {
    await scanAuction(auctionAddress, chainId);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
