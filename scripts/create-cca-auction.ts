/**
 * Create a CCA (Continuous Clearing Auction) on Base Sepolia
 * 
 * Following Uniswap's official documentation:
 * https://docs.uniswap.org/contracts/liquidity-launchpad/quickstart/example-configuration
 *
 * Run: yarn create-cca-auction
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  encodeAbiParameters,
  parseAbiParameters,
  decodeEventLog,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { liquidityLauncherAbi } from '../lib/contracts/abis';
import {
  LIQUIDITY_LAUNCHER_ADDRESS,
  CCA_FACTORY,
  UERC20_FACTORY,
  NATIVE_ETH,
} from '../lib/contracts/addresses';
import { encodeTokenMetadata } from '../lib/contracts/encoder';

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// Configuration
// ============================================================================

interface AuctionConfig {
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  tokenSupply: bigint;
  auctionDurationBlocks: number;
  floorPrice: bigint;
  tickSpacing: bigint;
  steps: AuctionStep[];
}

interface AuctionStep {
  /** Per-block issuance rate in MPS (1e7 = 100% total supply) */
  mps: number;
  /** Number of blocks this rate applies */
  blockDelta: number;
}

const DEFAULT_CONFIG: AuctionConfig = {
  tokenName: `CCA Test ${Date.now()}`,
  tokenSymbol: 'CCATEST',
  tokenDescription: 'CCA auction test token',
  tokenSupply: parseEther('1000000'), // 1M tokens
  auctionDurationBlocks: 100, // ~200 seconds on Base Sepolia
  // Floor price: 1 << 96 in Q96 format (1:1 ratio)
  floorPrice: BigInt('79228162514264337593543950336'),
  tickSpacing: BigInt('79228162514264337593543950336'),
  // Auction steps: 10% over 50 blocks, 49% over 49 blocks, 41% in last block
  // Total: 10% + 49% + 41% = 100%
  steps: [
    { mps: 20_000, blockDelta: 50 },    // 20000 * 50 = 1,000,000 = 10%
    { mps: 100_000, blockDelta: 49 },   // 100000 * 49 = 4,900,000 = 49%
    { mps: 4_100_000, blockDelta: 1 },  // 4100000 * 1 = 4,100,000 = 41%
  ],
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
  {
    type: 'event',
    name: 'AuctionCreated',
    inputs: [
      { name: 'distributionContract', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'amount', type: 'uint128', indexed: false },
      { name: 'parameters', type: 'bytes', indexed: false },
    ],
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

// ============================================================================
// Encoding Functions
// ============================================================================

/**
 * Encode auction steps data for the CCA contract
 * 
 * Each step is 8 bytes (bytes8) where:
 * - High 24 bits (first 3 bytes): mps rate
 * - Low 40 bits: blockDelta
 * 
 * The contract parses with: mps = uint24(bytes3(data)), blockDelta = uint40(uint64(data))
 */
function encodeAuctionSteps(steps: AuctionStep[]): Hex {
  let data = '0x';
  for (const step of steps) {
    const packed = (BigInt(step.mps) << 40n) | BigInt(step.blockDelta);
    data += packed.toString(16).padStart(16, '0');
  }
  return data as Hex;
}

/**
 * Encode AuctionParameters struct for the CCA Factory
 */
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
// Main
// ============================================================================

async function main() {
  // Validate environment
  const privateKey = process.env.TESTNET_WALLET_PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error('TESTNET_WALLET_PRIVATE_KEY not found in .env.local');
  }

  const pk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  const account = privateKeyToAccount(pk);
  const deployer = account.address;

  // Setup clients
  const transport = http('https://sepolia.base.org');
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });

  console.log('Deployer:', deployer);
  console.log('');

  const cfg = DEFAULT_CONFIG;

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Create Token
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Step 1: Creating token...');

  const tokenData = encodeTokenMetadata({
    description: cfg.tokenDescription,
    website: 'https://example.com',
    image: '',
  });

  const createTxHash = await walletClient.writeContract({
    address: LIQUIDITY_LAUNCHER_ADDRESS,
    abi: liquidityLauncherAbi,
    functionName: 'createToken',
    args: [UERC20_FACTORY, cfg.tokenName, cfg.tokenSymbol, 18, cfg.tokenSupply, deployer, tokenData],
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

  console.log('  Token:', tokenAddress);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Deploy Auction
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Step 2: Deploying auction...');

  const currentBlock = await publicClient.getBlockNumber();
  const startBlock = currentBlock + 5n;
  const endBlock = startBlock + BigInt(cfg.auctionDurationBlocks);

  const configData = encodeAuctionConfig({
    currency: NATIVE_ETH,
    tokensRecipient: deployer,
    fundsRecipient: deployer,
    startBlock,
    endBlock,
    claimBlock: endBlock,
    tickSpacing: cfg.tickSpacing,
    validationHook: '0x0000000000000000000000000000000000000000',
    floorPrice: cfg.floorPrice,
    requiredCurrencyRaised: 0n,
    auctionStepsData: encodeAuctionSteps(cfg.steps),
  });

  const deployTxHash = await walletClient.writeContract({
    address: CCA_FACTORY,
    abi: ccaFactoryAbi,
    functionName: 'initializeDistribution',
    args: [tokenAddress, cfg.tokenSupply, configData, '0x0000000000000000000000000000000000000000000000000000000000000000'],
  });

  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployTxHash });
  if (deployReceipt.status !== 'success') throw new Error('Auction deployment failed');

  // Get auction address from AuctionCreated event
  const auctionLog = deployReceipt.logs.find(
    (log) => log.address.toLowerCase() === CCA_FACTORY.toLowerCase() && log.topics[1]
  );
  if (!auctionLog?.topics[1]) throw new Error('AuctionCreated event not found');

  const auctionAddress = ('0x' + auctionLog.topics[1].slice(26)) as Address;
  console.log('  Auction:', auctionAddress);

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Fund Auction
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Step 3: Transferring tokens...');

  const transferTx = await walletClient.writeContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [auctionAddress, cfg.tokenSupply],
  });
  await publicClient.waitForTransactionReceipt({ hash: transferTx });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Activate Auction
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Step 4: Activating auction...');

  const activateTx = await walletClient.writeContract({
    address: auctionAddress,
    abi: distributionContractAbi,
    functionName: 'onTokensReceived',
    args: [],
  });
  await publicClient.waitForTransactionReceipt({ hash: activateTx });

  // ─────────────────────────────────────────────────────────────────────────
  // Verify
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Step 5: Verifying...');

  const code = await publicClient.getBytecode({ address: auctionAddress });
  if (!code || code.length <= 2) throw new Error('Auction contract not found');

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  CCA AUCTION DEPLOYED SUCCESSFULLY');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Token:   ', tokenAddress);
  console.log('  Auction: ', auctionAddress);
  console.log('  Supply:  ', cfg.tokenSupply.toString(), 'wei');
  console.log('');
  console.log('  Basescan:');
  console.log('    Token:  ', `https://sepolia.basescan.org/token/${tokenAddress}`);
  console.log('    Auction:', `https://sepolia.basescan.org/address/${auctionAddress}`);
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
