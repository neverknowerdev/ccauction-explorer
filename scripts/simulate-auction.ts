/**
 * Simulate a CCA (Continuous Clearing Auction) on Base Sepolia
 * 
 * This script:
 * 1. Creates a test token
 * 2. Creates a CCA auction
 * 3. Generates multiple wallets
 * 4. Funds wallets with ETH for gas
 * 5. Simulates bids with random intervals
 * 
 * Run: yarn simulate-auction [options]
 * 
 * Options:
 *   --wallets <n>     Number of wallets to create (default: 50)
 *   --duration <s>    Auction duration in seconds (default: 600 = 10 mins)
 *   --delay <s>       Start delay in seconds (default: 30)
 *   --bid-delay <s>   Delay between bids in seconds (default: 2)
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
  encodeAbiParameters,
  parseAbiParameters,
  decodeEventLog,
  type Address,
  type Hex,
  type PrivateKeyAccount,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { liquidityLauncherAbi } from '../lib/contracts/abis';
import {
  LIQUIDITY_LAUNCHER_ADDRESS,
  CCA_FACTORY,
  UERC20_FACTORY,
  NATIVE_ETH,
} from '../lib/contracts/addresses';
import { encodeTokenMetadata, priceToQ96 } from '../lib/contracts/encoder';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// Configuration
// ============================================================================

interface SimulationConfig {
  numWallets: number;
  auctionDurationSeconds: number;
  startDelaySeconds: number;
  bidDelaySeconds: number;
}

const DEFAULT_CONFIG: SimulationConfig = {
  numWallets: 50,
  auctionDurationSeconds: 600, // 10 minutes
  startDelaySeconds: 30,
  bidDelaySeconds: 2,
};

// Token configuration - designed to create price movement
const TOKEN_CONFIG = {
  name: `Sim Token ${Date.now()}`,
  symbol: 'SIMTEST',
  description: 'Simulation test token for CCA auction',
  // Lower supply = more price pressure from bids
  supply: parseEther('100000'), // 100k tokens
};

// Auction configuration
const AUCTION_CONFIG = {
  // Very low floor price to allow price discovery
  floorPrice: 0.0000001, // ETH per token
  // Min ETH per bid
  minBidAmount: parseEther('0.001'),
  // Max ETH per bid  
  maxBidAmount: parseEther('0.01'),
  // Price multiplier range above floor (1.5x to 10x floor)
  minPriceMultiplier: 1.5,
  maxPriceMultiplier: 10,
};

// ETH amounts
const ETH_CONFIG = {
  // Amount to send to each wallet for gas + bidding
  perWallet: parseEther('0.015'),
  // Minimum balance to keep bidding
  minBalance: parseEther('0.002'),
};

// ============================================================================
// ABIs
// ============================================================================

const ccaFactoryAbi = [
  {
    type: 'function',
    name: 'initializeDistribution',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'totalSupply', type: 'uint256' },
      { name: 'configData', type: 'bytes' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ name: 'distributionContract', type: 'address' }],
    stateMutability: 'nonpayable',
  },
] as const;

const distributionContractAbi = [
  {
    type: 'function',
    name: 'onTokensReceived',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const erc20Abi = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

const ccaAuctionAbi = [
  {
    type: 'function',
    name: 'submitBid',
    inputs: [
      { name: 'maxPrice', type: 'uint256' },
      { name: 'amount', type: 'uint128' },
      { name: 'owner', type: 'address' },
      { name: 'hookData', type: 'bytes' },
    ],
    outputs: [{ name: 'bidId', type: 'uint256' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'clearingPrice',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'startBlock',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'endBlock',
    inputs: [],
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'currencyRaised',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalCleared',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'checkpoint',
    inputs: [],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'blockNumber', type: 'uint64' },
          { name: 'clearingPrice', type: 'uint256' },
          { name: 'cumulativeMps', type: 'uint24' },
        ],
      },
    ],
    stateMutability: 'nonpayable',
  },
] as const;

// ============================================================================
// Encoding Functions
// ============================================================================

interface AuctionStep {
  mps: number;
  blockDelta: number;
}

function encodeAuctionSteps(steps: AuctionStep[]): Hex {
  let data = '0x';
  for (const step of steps) {
    const packed = (BigInt(step.mps) << 40n) | BigInt(step.blockDelta);
    data += packed.toString(16).padStart(16, '0');
  }
  return data as Hex;
}

function encodeAuctionConfig(params: {
  currency: Address;
  tokensRecipient: Address;
  fundsRecipient: Address;
  startBlock: bigint;
  endBlock: bigint;
  claimBlock: bigint;
  tickSpacing: bigint;
  validationHook: Address;
  floorPrice: bigint;
  requiredCurrencyRaised: bigint;
  auctionStepsData: Hex;
}): Hex {
  return encodeAbiParameters(
    parseAbiParameters(
      '(address,address,address,uint64,uint64,uint64,uint256,address,uint256,uint128,bytes)'
    ),
    [[
      params.currency,
      params.tokensRecipient,
      params.fundsRecipient,
      params.startBlock,
      params.endBlock,
      params.claimBlock,
      params.tickSpacing,
      params.validationHook,
      params.floorPrice,
      params.requiredCurrencyRaised,
      params.auctionStepsData,
    ]]
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

const Q96 = BigInt(2) ** BigInt(96);

function formatQ96Price(price: bigint): string {
  const priceNum = Number(price) / Number(Q96);
  return priceNum.toFixed(12);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomBigIntBetween(min: bigint, max: bigint): bigint {
  const range = max - min;
  const randomFactor = BigInt(Math.floor(Math.random() * 1000000));
  return min + (range * randomFactor) / 1000000n;
}

function parseArgs(): SimulationConfig {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--wallets':
        config.numWallets = parseInt(args[++i], 10);
        break;
      case '--duration':
        config.auctionDurationSeconds = parseInt(args[++i], 10);
        break;
      case '--delay':
        config.startDelaySeconds = parseInt(args[++i], 10);
        break;
      case '--bid-delay':
        config.bidDelaySeconds = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
Usage: yarn simulate-auction [options]

Options:
  --wallets <n>     Number of wallets to create (default: 50)
  --duration <s>    Auction duration in seconds (default: 600)
  --delay <s>       Start delay in seconds (default: 30)
  --bid-delay <s>   Delay between bids in seconds (default: 2)
  --help           Show this help message
`);
        process.exit(0);
    }
  }

  return config;
}

// ============================================================================
// Wallet Management
// ============================================================================

interface WalletInfo {
  privateKey: Hex;
  account: PrivateKeyAccount;
  address: Address;
}

function generateWallets(count: number): WalletInfo[] {
  console.log(`\nGenerating ${count} wallets...`);
  const wallets: WalletInfo[] = [];

  for (let i = 0; i < count; i++) {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    wallets.push({
      privateKey,
      account,
      address: account.address,
    });
  }

  console.log(`  Generated ${count} wallets`);
  return wallets;
}

// ============================================================================
// Main Simulation
// ============================================================================

async function main() {
  const cfg = parseArgs();

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  CCA AUCTION SIMULATION');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`\nConfiguration:`);
  console.log(`  Wallets:          ${cfg.numWallets}`);
  console.log(`  Auction Duration: ${cfg.auctionDurationSeconds}s (~${Math.floor(cfg.auctionDurationSeconds / 60)} mins)`);
  console.log(`  Start Delay:      ${cfg.startDelaySeconds}s`);
  console.log(`  Bid Delay:        ${cfg.bidDelaySeconds}s`);

  // Validate environment
  const privateKey = process.env.TESTNET_WALLET_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error('TESTNET_WALLET_PRIVATE_KEY not found in .env.local');
  }

  const pk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  const masterAccount = privateKeyToAccount(pk);
  const deployer = masterAccount.address;

  // Setup clients
  const transport = http('https://sepolia.base.org');
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const masterWalletClient = createWalletClient({ account: masterAccount, chain: baseSepolia, transport });

  // Check master wallet balance
  const masterBalance = await publicClient.getBalance({ address: deployer });
  const requiredBalance = ETH_CONFIG.perWallet * BigInt(cfg.numWallets) + parseEther('0.1'); // Extra for gas

  console.log(`\nMaster Wallet: ${deployer}`);
  console.log(`  Balance: ${formatEther(masterBalance)} ETH`);
  console.log(`  Required: ~${formatEther(requiredBalance)} ETH`);

  if (masterBalance < requiredBalance) {
    throw new Error(`Insufficient balance. Need at least ${formatEther(requiredBalance)} ETH`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Generate Wallets
  // ─────────────────────────────────────────────────────────────────────────
  const wallets = generateWallets(cfg.numWallets);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Create Token
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Step 1: Creating token...');

  const tokenData = encodeTokenMetadata({
    description: TOKEN_CONFIG.description,
    website: 'https://example.com/simulation',
    image: '',
  });

  const createTxHash = await masterWalletClient.writeContract({
    address: LIQUIDITY_LAUNCHER_ADDRESS,
    abi: liquidityLauncherAbi,
    functionName: 'createToken',
    args: [UERC20_FACTORY, TOKEN_CONFIG.name, TOKEN_CONFIG.symbol, 18, TOKEN_CONFIG.supply, deployer, tokenData],
  });

  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTxHash });
  if (createReceipt.status !== 'success') throw new Error('Token creation failed');

  const tokenLog = createReceipt.logs.find((log) => {
    try {
      return decodeEventLog({ abi: liquidityLauncherAbi, data: log.data, topics: log.topics }).eventName === 'TokenCreated';
    } catch { return false; }
  });
  if (!tokenLog) throw new Error('TokenCreated event not found');

  const tokenAddress = (decodeEventLog({
    abi: liquidityLauncherAbi,
    data: tokenLog.data,
    topics: tokenLog.topics,
  }).args as { tokenAddress: Address }).tokenAddress;

  console.log(`  Token: ${tokenAddress}`);
  console.log(`  Supply: ${formatEther(TOKEN_CONFIG.supply)} ${TOKEN_CONFIG.symbol}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Deploy Auction
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Step 2: Deploying auction...');

  const currentBlock = await publicClient.getBlockNumber();
  const blockTime = 2; // Base Sepolia ~2 second blocks

  const startBlock = currentBlock + BigInt(Math.ceil(cfg.startDelaySeconds / blockTime));
  const durationBlocks = Math.ceil(cfg.auctionDurationSeconds / blockTime);
  const endBlock = startBlock + BigInt(durationBlocks);
  const claimBlock = endBlock + 10n;

  // Floor price in Q96 format
  const floorPriceQ96 = priceToQ96(AUCTION_CONFIG.floorPrice);
  // Tick spacing (1% of floor price, minimum 1)
  const tickSpacing = floorPriceQ96 / 100n || 1n;

  // Generate auction steps - distribute tokens gradually
  // Using 3 phases: slow start, main phase, final burst
  const phase1Blocks = Math.floor(durationBlocks * 0.2); // 20% of time
  const phase2Blocks = Math.floor(durationBlocks * 0.6); // 60% of time
  const phase3Blocks = durationBlocks - phase1Blocks - phase2Blocks; // 20% of time

  // MPS calculation (total must equal 10_000_000 = 100%)
  // Phase 1: 10% of tokens
  // Phase 2: 50% of tokens
  // Phase 3: 40% of tokens
  const steps: AuctionStep[] = [
    { mps: Math.floor(1_000_000 / phase1Blocks), blockDelta: phase1Blocks },
    { mps: Math.floor(5_000_000 / phase2Blocks), blockDelta: phase2Blocks },
    { mps: Math.floor(4_000_000 / phase3Blocks), blockDelta: phase3Blocks },
  ];

  // Verify steps sum to 100%
  const totalMps = steps.reduce((sum, s) => sum + s.mps * s.blockDelta, 0);
  if (totalMps < 10_000_000) {
    // Adjust last step to make it exactly 100%
    const diff = 10_000_000 - totalMps;
    steps[steps.length - 1].mps += Math.ceil(diff / steps[steps.length - 1].blockDelta);
  }

  console.log(`  Start Block: ${startBlock} (in ~${cfg.startDelaySeconds}s)`);
  console.log(`  End Block: ${endBlock} (duration: ${durationBlocks} blocks)`);
  console.log(`  Floor Price: ${AUCTION_CONFIG.floorPrice} ETH/token`);
  console.log(`  Auction Steps:`);
  steps.forEach((s, i) => {
    const pct = ((s.mps * s.blockDelta) / 100_000).toFixed(2);
    console.log(`    Phase ${i + 1}: ${pct}% over ${s.blockDelta} blocks`);
  });

  const configData = encodeAuctionConfig({
    currency: NATIVE_ETH,
    tokensRecipient: deployer,
    fundsRecipient: deployer,
    startBlock,
    endBlock,
    claimBlock,
    tickSpacing,
    validationHook: '0x0000000000000000000000000000000000000000',
    floorPrice: floorPriceQ96,
    requiredCurrencyRaised: 0n,
    auctionStepsData: encodeAuctionSteps(steps),
  });

  const deployTxHash = await masterWalletClient.writeContract({
    address: CCA_FACTORY,
    abi: ccaFactoryAbi,
    functionName: 'initializeDistribution',
    args: [tokenAddress, TOKEN_CONFIG.supply, configData, '0x0000000000000000000000000000000000000000000000000000000000000000'],
  });

  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployTxHash });
  if (deployReceipt.status !== 'success') throw new Error('Auction deployment failed');

  const auctionLog = deployReceipt.logs.find(
    (log) => log.address.toLowerCase() === CCA_FACTORY.toLowerCase() && log.topics[1]
  );
  if (!auctionLog?.topics[1]) throw new Error('AuctionCreated event not found');

  const auctionAddress = ('0x' + auctionLog.topics[1].slice(26)) as Address;
  console.log(`  Auction: ${auctionAddress}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Fund Auction with Tokens
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Step 3: Funding auction with tokens...');

  const transferTx = await masterWalletClient.writeContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [auctionAddress, TOKEN_CONFIG.supply],
  });
  await publicClient.waitForTransactionReceipt({ hash: transferTx });
  console.log(`  Transferred ${formatEther(TOKEN_CONFIG.supply)} tokens to auction`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Activate Auction
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Step 4: Activating auction...');

  const activateTx = await masterWalletClient.writeContract({
    address: auctionAddress,
    abi: distributionContractAbi,
    functionName: 'onTokensReceived',
    args: [],
  });
  await publicClient.waitForTransactionReceipt({ hash: activateTx });
  console.log('  Auction activated!');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6: Fund Simulation Wallets
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Step 5: Funding simulation wallets...');

  const BATCH_SIZE = 10;
  for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
    const batch = wallets.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (wallet) => {
      const tx = await masterWalletClient.sendTransaction({
        to: wallet.address,
        value: ETH_CONFIG.perWallet,
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
    });
    await Promise.all(promises);
    console.log(`  Funded wallets ${i + 1}-${Math.min(i + BATCH_SIZE, wallets.length)}/${wallets.length}`);
  }

  console.log(`  Total funded: ${formatEther(ETH_CONFIG.perWallet * BigInt(wallets.length))} ETH`);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 7: Wait for Auction Start
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Step 6: Waiting for auction to start...');

  let currentBlockNum = await publicClient.getBlockNumber();
  while (currentBlockNum < startBlock) {
    const blocksRemaining = Number(startBlock - currentBlockNum);
    const secondsRemaining = blocksRemaining * blockTime;
    process.stdout.write(`\r  Blocks until start: ${blocksRemaining} (~${secondsRemaining}s)    `);
    await sleep(2000);
    currentBlockNum = await publicClient.getBlockNumber();
  }
  console.log('\n  Auction started!');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 8: Simulate Bids
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Step 7: Simulating bids...');
  console.log('');

  let bidCount = 0;
  let totalBidAmount = 0n;
  let walletIndex = 0;
  const usedWallets = new Set<number>();

  // Calculate max price based on floor price
  const maxPriceQ96 = priceToQ96(AUCTION_CONFIG.floorPrice * AUCTION_CONFIG.maxPriceMultiplier);
  const minPriceQ96 = priceToQ96(AUCTION_CONFIG.floorPrice * AUCTION_CONFIG.minPriceMultiplier);

  // Main bidding loop
  while (true) {
    currentBlockNum = await publicClient.getBlockNumber();

    if (currentBlockNum >= endBlock) {
      console.log('\n  Auction ended!');
      break;
    }

    // Get current clearing price for display
    let clearingPriceQ96 = 0n;
    try {
      clearingPriceQ96 = await publicClient.readContract({
        address: auctionAddress,
        abi: ccaAuctionAbi,
        functionName: 'clearingPrice',
      });
    } catch {
      // Clearing price might not be set yet
    }

    // Pick a wallet (cycle through if needed)
    if (walletIndex >= wallets.length) {
      walletIndex = 0;
      usedWallets.clear();
    }

    const wallet = wallets[walletIndex];
    walletIndex++;

    // Check wallet balance
    const walletBalance = await publicClient.getBalance({ address: wallet.address });
    if (walletBalance < ETH_CONFIG.minBalance) {
      console.log(`  Wallet ${walletIndex} has insufficient balance, skipping...`);
      continue;
    }

    // Generate random bid parameters
    const bidPriceQ96 = randomBigIntBetween(minPriceQ96, maxPriceQ96);
    const bidAmount = randomBigIntBetween(AUCTION_CONFIG.minBidAmount, AUCTION_CONFIG.maxBidAmount);

    // Ensure bid price is above clearing price
    const effectiveBidPriceQ96 = bidPriceQ96 > clearingPriceQ96 ? bidPriceQ96 : clearingPriceQ96 + tickSpacing;

    try {
      const walletClient = createWalletClient({
        account: wallet.account,
        chain: baseSepolia,
        transport,
      });

      const bidTxHash = await walletClient.writeContract({
        address: auctionAddress,
        abi: ccaAuctionAbi,
        functionName: 'submitBid',
        args: [effectiveBidPriceQ96, bidAmount, wallet.address, '0x'],
        value: bidAmount,
      });

      await publicClient.waitForTransactionReceipt({ hash: bidTxHash });

      bidCount++;
      totalBidAmount += bidAmount;

      // Get updated clearing price
      const newClearingPriceQ96 = await publicClient.readContract({
        address: auctionAddress,
        abi: ccaAuctionAbi,
        functionName: 'clearingPrice',
      });

      const blocksRemaining = Number(endBlock - currentBlockNum);
      const priceChange = clearingPriceQ96 > 0n
        ? ((Number(newClearingPriceQ96 - clearingPriceQ96) / Number(clearingPriceQ96)) * 100).toFixed(2)
        : 'N/A';

      console.log(
        `  Bid #${bidCount}: ${formatEther(bidAmount)} ETH @ max ${formatQ96Price(effectiveBidPriceQ96)} | ` +
        `Clearing: ${formatQ96Price(newClearingPriceQ96)} (${priceChange}% change) | ` +
        `Blocks left: ${blocksRemaining}`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Only log if not a common expected error
      if (!errorMessage.includes('BidMustBeAboveClearingPrice') && !errorMessage.includes('insufficient funds')) {
        console.log(`  Bid failed: ${errorMessage.slice(0, 80)}...`);
      }
    }

    // Random delay with some variance
    const delay = cfg.bidDelaySeconds * 1000 * randomBetween(0.5, 1.5);
    await sleep(delay);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  SIMULATION COMPLETE');
  console.log('════════════════════════════════════════════════════════════');

  // Final auction state
  const [finalClearingPrice, currencyRaised, totalCleared] = await Promise.all([
    publicClient.readContract({
      address: auctionAddress,
      abi: ccaAuctionAbi,
      functionName: 'clearingPrice',
    }),
    publicClient.readContract({
      address: auctionAddress,
      abi: ccaAuctionAbi,
      functionName: 'currencyRaised',
    }),
    publicClient.readContract({
      address: auctionAddress,
      abi: ccaAuctionAbi,
      functionName: 'totalCleared',
    }),
  ]);

  console.log('');
  console.log(`  Token:           ${tokenAddress}`);
  console.log(`  Auction:         ${auctionAddress}`);
  console.log('');
  console.log(`  Total Bids:      ${bidCount}`);
  console.log(`  Total Bid Value: ${formatEther(totalBidAmount)} ETH`);
  console.log(`  Currency Raised: ${formatEther(currencyRaised)} ETH`);
  console.log(`  Tokens Cleared:  ${formatEther(totalCleared)} ${TOKEN_CONFIG.symbol}`);
  console.log('');
  console.log(`  Floor Price:     ${AUCTION_CONFIG.floorPrice} ETH/token`);
  console.log(`  Final Clearing:  ${formatQ96Price(finalClearingPrice)} ETH/token`);
  console.log(`  Price Change:    ${((Number(finalClearingPrice) / Number(priceToQ96(AUCTION_CONFIG.floorPrice)) - 1) * 100).toFixed(2)}%`);
  console.log('');
  console.log('  Basescan Links:');
  console.log(`    Token:   https://sepolia.basescan.org/token/${tokenAddress}`);
  console.log(`    Auction: https://sepolia.basescan.org/address/${auctionAddress}`);
  console.log('');
  console.log('════════════════════════════════════════════════════════════');

  // Save wallet info for potential recovery
  console.log('\n  Wallet private keys saved to: ./simulation-wallets.json');
  const fs = await import('fs');
  fs.writeFileSync(
    'simulation-wallets.json',
    JSON.stringify(
      wallets.map((w) => ({
        address: w.address,
        privateKey: w.privateKey,
      })),
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error('\nError:', err.message || err);
  process.exit(1);
});
