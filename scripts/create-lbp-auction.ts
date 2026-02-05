/**
 * Create a CCA Auction with Advanced LBP Strategy
 * 
 * Based on successful mainnet transaction:
 * https://etherscan.io/tx/0x3b37030109a8b943357ecd6920e66fa42ad46547905d94eefd3c6193a4fb0414
 * 
 * Run: yarn create-lbp-auction
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
  keccak256,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { liquidityLauncherAbi } from '../lib/contracts/abis';
import {
  LIQUIDITY_LAUNCHER_ADDRESS,
  UERC20_FACTORY,
  NATIVE_ETH,
  CCA_FACTORY,
} from '../lib/contracts/addresses';
import { encodeTokenMetadata } from '../lib/contracts/encoder';

config({ path: resolve(process.cwd(), '.env.local') });

// ============================================================================
// Base Sepolia Addresses
// ============================================================================

/** AdvancedLBPStrategyFactory on Base Sepolia (v2.0.0) */
const ADVANCED_LBP_STRATEGY_FACTORY = '0x67E24586231D4329AfDbF1F4Ac09E081cFD1e6a6' as const;

// ============================================================================
// Configuration (matching successful mainnet tx pattern)
// ============================================================================

const TOKEN_SUPPLY = parseEther('1000000'); // 1M tokens

// ============================================================================
// Encoding Functions - Match Mainnet TX Pattern
// ============================================================================

/**
 * Encode auction steps
 * Each step: (mps << 40) | blockDelta
 */
function encodeAuctionSteps(steps: Array<{ mps: number; blockDelta: number }>): Hex {
  let data = '0x';
  for (const step of steps) {
    const packed = (BigInt(step.mps) << 40n) | BigInt(step.blockDelta);
    data += packed.toString(16).padStart(16, '0');
  }
  return data as Hex;
}

/**
 * Encode configData for AdvancedLBPStrategyFactory
 * 
 * Format (based on successful mainnet tx):
 * abi.encode(
 *   MigratorParameters,          // tuple
 *   bool createOneSidedToken,    // true/false
 *   bool createOneSidedCurrency, // true/false  
 *   bytes auctionParamsEncoded   // abi.encode(AuctionParameters)
 * )
 */
function encodeAdvancedLBPConfigData(params: {
  // MigratorParameters
  migrationBlock: bigint;
  currency: Address;
  poolLPFee: number;
  poolTickSpacing: number;
  tokenSplit: number;
  initializerFactory: Address;
  positionRecipient: Address;
  sweepBlock: bigint;
  operator: Address;
  maxCurrencyAmountForLP: bigint;
  // AdvancedLBP bools
  createOneSidedTokenPosition: boolean;
  createOneSidedCurrencyPosition: boolean;
  // AuctionParameters
  auctionCurrency: Address;
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
  // First encode AuctionParameters as bytes
  const auctionParamsEncoded = encodeAbiParameters(
    parseAbiParameters('(address,address,address,uint64,uint64,uint64,uint256,address,uint256,uint128,bytes)'),
    [[
      params.auctionCurrency,
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

  // Encode full configData: (MigratorParams tuple, bool, bool, bytes)
  return encodeAbiParameters(
    parseAbiParameters('(uint64,address,uint24,int24,uint24,address,address,uint64,address,uint128),bool,bool,bytes'),
    [
      [
        params.migrationBlock,
        params.currency,
        params.poolLPFee,
        params.poolTickSpacing,
        params.tokenSplit,
        params.initializerFactory,
        params.positionRecipient,
        params.sweepBlock,
        params.operator,
        params.maxCurrencyAmountForLP,
      ],
      params.createOneSidedTokenPosition,
      params.createOneSidedCurrencyPosition,
      auctionParamsEncoded,
    ]
  );
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const privateKey = process.env.TESTNET_WALLET_PRIVATE_KEY?.trim();
  if (!privateKey) throw new Error('TESTNET_WALLET_PRIVATE_KEY not found');

  const pk = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  const account = privateKeyToAccount(pk);
  const deployer = account.address;

  const transport = http('https://sepolia.base.org');
  const publicClient = createPublicClient({ chain: baseSepolia, transport });
  const walletClient = createWalletClient({ account, chain: baseSepolia, transport });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Advanced LBP Auction Creator');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Deployer:', deployer);
  console.log('Strategy Factory:', ADVANCED_LBP_STRATEGY_FACTORY);
  console.log('CCA Factory:', CCA_FACTORY);
  console.log('');

  const currentBlock = await publicClient.getBlockNumber();
  console.log('Current block:', currentBlock.toString());

  // Calculate block numbers (similar to mainnet tx pattern)
  const startBlock = currentBlock + 20n;         // Start ~40 seconds from now
  const endBlock = startBlock + 100n;            // 100 blocks auction (~200 sec)
  const claimBlock = endBlock + 10n;             // Claim 10 blocks after end
  const migrationBlock = claimBlock + 20n;       // Migration 20 blocks after claim
  const sweepBlock = migrationBlock + 1000n;     // Sweep 1000 blocks after migration

  console.log('');
  console.log('Timeline:');
  console.log('  Start:', startBlock.toString());
  console.log('  End:', endBlock.toString());
  console.log('  Claim:', claimBlock.toString());
  console.log('  Migration:', migrationBlock.toString());
  console.log('  Sweep:', sweepBlock.toString());

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Create Token
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('Step 1: Creating token...');

  const tokenName = `LBP Test ${Date.now()}`;
  const createTxHash = await walletClient.writeContract({
    address: LIQUIDITY_LAUNCHER_ADDRESS,
    abi: liquidityLauncherAbi,
    functionName: 'createToken',
    args: [
      UERC20_FACTORY,
      tokenName,
      'LBPTEST',
      18,
      TOKEN_SUPPLY,
      LIQUIDITY_LAUNCHER_ADDRESS, // Mint to launcher
      encodeTokenMetadata({ description: 'LBP test token', website: '', image: '' }),
    ],
  });

  console.log('  Tx:', createTxHash);
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
  // Step 2: Distribute via AdvancedLBPStrategy
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('Step 2: Distributing via AdvancedLBPStrategy...');

  // Recalculate with fresh block
  const newBlock = await publicClient.getBlockNumber();
  const newStartBlock = newBlock + 20n;
  const newEndBlock = newStartBlock + 100n;
  const newClaimBlock = newEndBlock + 10n;
  const newMigrationBlock = newClaimBlock + 20n;
  const newSweepBlock = newMigrationBlock + 1000n;

  // Auction steps: match mainnet pattern (sell tokens over auction duration)
  // Total MPS must equal 10,000,000 (100%)
  const auctionStepsData = encodeAuctionSteps([
    { mps: 20_000, blockDelta: 50 },    // 1M MPS over 50 blocks
    { mps: 100_000, blockDelta: 49 },   // 4.9M MPS over 49 blocks  
    { mps: 4_100_000, blockDelta: 1 },  // 4.1M MPS in last block
  ]);

  // Use address(1) as sentinel - factory replaces with strategy address
  const SENTINEL = '0x0000000000000000000000000000000000000001' as Address;
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

  // Floor price in Q96 format (1 << 96 = 1:1 ratio)
  const floorPrice = BigInt('79228162514264337593543950336');
  // Tick spacing (~1% of floor price for reasonable granularity)
  const tickSpacing = floorPrice / 100n;

  const configData = encodeAdvancedLBPConfigData({
    // MigratorParameters
    migrationBlock: newMigrationBlock,
    currency: NATIVE_ETH,
    poolLPFee: 500,            // 0.05% (matching mainnet tx)
    poolTickSpacing: 10,       // Standard for 0.05% fee tier (matching mainnet)
    tokenSplit: 5_000_000,     // 50% to auction (in MPS)
    initializerFactory: CCA_FACTORY,
    positionRecipient: deployer,
    sweepBlock: newSweepBlock,
    operator: deployer,
    maxCurrencyAmountForLP: BigInt('340282366920938463463374607431768211455'), // max uint128
    // AdvancedLBP settings
    createOneSidedTokenPosition: true,
    createOneSidedCurrencyPosition: true,
    // AuctionParameters
    auctionCurrency: NATIVE_ETH,
    tokensRecipient: deployer,   // Deployer receives unsold tokens (strategy should override)
    fundsRecipient: deployer,    // Deployer receives raised funds (strategy should override)
    startBlock: newStartBlock,
    endBlock: newEndBlock,
    claimBlock: newClaimBlock,
    tickSpacing,
    validationHook: ZERO_ADDRESS,
    floorPrice,
    requiredCurrencyRaised: BigInt(0),
    auctionStepsData,
  });

  console.log('  ConfigData length:', configData.length, 'bytes');

  // Generate a random salt (like the mainnet tx)
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const salt = toHex(randomBytes) as Hex;
  console.log('  Salt:', salt);

  try {
    const distributeTxHash = await walletClient.writeContract({
      address: LIQUIDITY_LAUNCHER_ADDRESS,
      abi: liquidityLauncherAbi,
      functionName: 'distributeToken',
      args: [
        tokenAddress,
        {
          strategy: ADVANCED_LBP_STRATEGY_FACTORY,
          amount: TOKEN_SUPPLY,
          configData,
        },
        false, // payerIsUser = false (tokens in launcher)
        salt,
      ],
    });

    console.log('  Distribute tx:', distributeTxHash);
    const distributeReceipt = await publicClient.waitForTransactionReceipt({ hash: distributeTxHash });

    if (distributeReceipt.status !== 'success') {
      console.log('Transaction failed. Check:', `https://sepolia.basescan.org/tx/${distributeTxHash}`);
      throw new Error('Distribution failed');
    }

    // Find strategy address
    let strategyAddress: Address | null = null;
    for (const log of distributeReceipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: liquidityLauncherAbi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'TokenDistributed') {
          strategyAddress = (decoded.args as { distributionContract: Address }).distributionContract;
        }
      } catch { /* not matching */ }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SUCCESS! LBP AUCTION DEPLOYED');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Token:', tokenAddress);
    console.log('  Strategy:', strategyAddress || 'Check tx logs');
    console.log('');
    console.log('Links:');
    console.log('  Token:', `https://sepolia.basescan.org/token/${tokenAddress}`);
    if (strategyAddress) {
      console.log('  Strategy:', `https://sepolia.basescan.org/address/${strategyAddress}`);
    }
    console.log('  Tx:', `https://sepolia.basescan.org/tx/${distributeTxHash}`);
    console.log('');
    console.log('Timeline:');
    console.log('  Auction ends at block:', newEndBlock.toString());
    console.log('  Claims available at block:', newClaimBlock.toString());
    console.log('  Migration available at block:', newMigrationBlock.toString());

  } catch (error: unknown) {
    const errStr = String(error);

    console.log('');
    console.log('ERROR during distribution:');

    if (errStr.includes('0xe65af6a0')) {
      console.log('');
      console.log('HookAddressNotValid (0xe65af6a0)');
      console.log('');
      console.log('The CCA auction hook address is invalid.');
      console.log('Token was created:', tokenAddress);
    } else {
      console.log(errStr.slice(0, 1000));
    }

    throw error;
  }
}

main().catch((err) => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});
