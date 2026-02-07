/**
 * Auction info fetcher - fetches on-chain auction data
 * 
 * Supports two modes:
 * 1. fetchAuctionInfoFromTx - Fetch from creation transaction hash (full info)
 * 2. fetchAuctionOnChainInfo - Fetch from auction address (current state)
 */

import {
  createPublicClient,
  http,
  decodeAbiParameters,
  parseAbiParameters,
  decodeFunctionData,
  formatUnits,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { SUPPORTED_CHAINS, SUPPORTED_CHAIN_IDS, isChainSupported as isChainSupportedInConfig } from '@/lib/chains';
import { createAlchemyClient, getContractCreationTxHash, type CoinGeckoTokenInfo, type EtherscanTokenInfo } from '@/lib/providers';

// ============================================================================
// Known Contracts
// ============================================================================

const KNOWN_CONTRACTS: Record<string, string> = {
  '0x00000008412db3394c91a5cbd01635c6d140637c': 'LiquidityLauncher',
  '0xcca1101c61cf5cb44c968947985300df945c3565': 'ContinuousClearingAuctionFactory',
  '0x0000ccadf55c911a2fbc0bb9d2942aa77c6faa1d': 'ContinuousClearingAuctionFactory',
};

const KNOWN_STRATEGY_FACTORIES: Record<string, string> = {
  '0xbbbb6ffabccb1eafd4f0baed6764d8aa973316b6': 'AdvancedLBPStrategyFactory',
  '0x67e24586231d4329afdbf1f4ac09e081cfd1e6a6': 'AdvancedLBPStrategyFactory',
  '0xa3a236647c80bcd69cad561acf863c29981b6fbc': 'FullRangeLBPStrategyFactory',
};

const MINT_SELECTORS = {
  'mint(address,uint256)': '0x40c10f19',
  'mint(address,uint256,bytes)': '0xcfa84fc1',
  'mint(uint256)': '0xa0712d68',
} as const;

// ============================================================================
// ABIs
// ============================================================================

const ccaAuctionAbi = [
  { type: 'function', name: 'token', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'currency', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'startBlock', inputs: [], outputs: [{ type: 'uint64' }], stateMutability: 'view' },
  { type: 'function', name: 'endBlock', inputs: [], outputs: [{ type: 'uint64' }], stateMutability: 'view' },
  { type: 'function', name: 'claimBlock', inputs: [], outputs: [{ type: 'uint64' }], stateMutability: 'view' },
  { type: 'function', name: 'floorPrice', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'requiredCurrencyRaised', inputs: [], outputs: [{ type: 'uint128' }], stateMutability: 'view' },
  { type: 'function', name: 'fundsRecipient', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'tokensRecipient', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
  { type: 'function', name: 'clearingPrice', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalTokensForSale', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalCurrencyRaised', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

const erc20Abi = [
  { type: 'function', name: 'name', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

const liquidityLauncherAbi = [
  {
    type: 'function',
    name: 'distributeToken',
    inputs: [
      { name: 'token', type: 'address' },
      {
        name: 'distribution',
        type: 'tuple',
        components: [
          { name: 'strategy', type: 'address' },
          { name: 'amount', type: 'uint128' },
          { name: 'configData', type: 'bytes' },
        ],
      },
      { name: 'payerIsUser', type: 'bool' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ name: 'distributionContract', type: 'address' }],
    stateMutability: 'nonpayable',
  },
] as const;

// ============================================================================
// Types
// ============================================================================

export interface AuctionParameters {
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
}

export interface MigratorParameters {
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
}

export interface PoolInfo {
  strategyFactory: Address;
  strategyFactoryName: string;
  distributionContract: Address;
  migratorParams: MigratorParameters;
  createOneSidedTokenPosition: boolean;
  createOneSidedCurrencyPosition: boolean;
}

export interface AuctionStep {
  mps: number;
  blockDelta: number;
}

export interface TimeInfo {
  startTime: Date;
  endTime: Date;
  claimTime: Date;
  durationSeconds: number;
  durationFormatted: string;
}

export interface TokenSupplyInfo {
  totalSupply: bigint;
  totalDistributed: bigint;
  auctionAmount: bigint;
  poolAmount: bigint;
  ownerRetained: bigint;
  auctionPercent: number;
  poolPercent: number;
  ownerPercent: number;
}

export interface TokenMintInfo {
  isMintable: boolean;
  hasOwner: boolean;
  owner: Address | null;
  mintFunctions: string[];
}

export interface AuctionInfo {
  // Transaction info
  txHash: Hex;
  chainId: number;
  chainName: string;
  blockNumber: bigint;
  timestamp: Date;
  from: Address;
  to: Address;
  blockTimeSeconds: number;

  // Distribution strategy
  calledVia: 'LiquidityLauncher' | 'CCAFactory' | 'Unknown';
  willCreatePool: boolean;
  poolInfo?: PoolInfo;
  /** Where surplus funds go when auction is overfunded: pool (LBP) or creator (fundsRecipient) */
  extraFundsDestination: 'pool' | 'creator';

  // Auction info
  factoryAddress: Address;
  auctionAddress: Address;
  auctionAmount: bigint;

  // Token info
  tokenAddress: Address;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenTotalSupply: bigint;
  tokenSupplyInfo: TokenSupplyInfo;
  tokenMintInfo: TokenMintInfo;

  // Auction parameters
  parameters: AuctionParameters;
  auctionSteps: AuctionStep[];

  // Time info
  timeInfo: TimeInfo;

  // Current state
  currentBlock: bigint;
  auctionStatus: 'planned' | 'active' | 'graduated' | 'ended' | 'claimable';
}

export interface AuctionOnChainInfo {
  tokenAddress: Address;
  currencyAddress: Address;
  startBlock: bigint;
  endBlock: bigint;
  claimBlock: bigint;
  floorPrice: bigint;
  requiredCurrencyRaised: bigint;
  fundsRecipient: Address;
  tokensRecipient: Address;
  clearingPrice: bigint;
  totalTokensForSale: bigint;
  totalCurrencyRaised: bigint;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenTotalSupply: bigint;
  startTime: Date | null;
  endTime: Date | null;
  currentBlock: bigint;
  status: 'planned' | 'active' | 'graduated' | 'ended' | 'claimable';
}

// ============================================================================
// Helper Functions (exported for testing)
// ============================================================================

export function getClient(chainId: number): PublicClient {
  const config = SUPPORTED_CHAINS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}. Supported: ${SUPPORTED_CHAIN_IDS.join(', ')}`);
  }
  // Use Alchemy when API key is set (avoids public RPC rate limits)
  if (process.env.ALCHEMY_API_KEY) {
    try {
      return createAlchemyClient(chainId) as PublicClient;
    } catch {
      // Chain not supported by Alchemy or other error — fall back to config RPC
    }
  }
  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  }) as PublicClient;
}

export function blockToTime(
  targetBlock: bigint,
  referenceBlock: bigint,
  referenceTime: Date,
  blockTimeSeconds: number
): Date {
  const blockDiff = Number(targetBlock - referenceBlock);
  const timeDiffMs = blockDiff * blockTimeSeconds * 1000;
  return new Date(referenceTime.getTime() + timeDiffMs);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins} min ${secs} sec` : `${mins} minutes`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hours`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return hours > 0 ? `${days} days ${hours} hr` : `${days} days`;
}

export function formatQ96Price(price: bigint): string {
  const Q96 = BigInt(2) ** BigInt(96);
  const priceNum = Number(price) / Number(Q96);
  return priceNum.toFixed(18);
}

export function getCurrencySymbol(address: Address, chainId: number): string {
  const lowerAddr = address.toLowerCase();
  if (lowerAddr === '0x0000000000000000000000000000000000000000') return 'ETH';
  if (
    lowerAddr === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' ||
    lowerAddr === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
  ) return 'USDC';
  return 'Unknown';
}

export function getContractName(address: Address): string {
  return KNOWN_CONTRACTS[address.toLowerCase()] || 'Unknown Contract';
}

export function getStrategyFactoryName(address: Address): string {
  return KNOWN_STRATEGY_FACTORIES[address.toLowerCase()] || 'Unknown Strategy';
}

export function decodeAuctionSteps(data: Hex): AuctionStep[] {
  const steps: AuctionStep[] = [];
  const hex = data.slice(2);
  for (let i = 0; i < hex.length; i += 16) {
    const chunk = hex.slice(i, i + 16);
    if (chunk.length < 16) break;
    const packed = BigInt('0x' + chunk);
    const mps = Number(packed >> BigInt(40)) & 0xffffff;
    const blockDelta = Number(packed & BigInt('0xffffffffff'));
    if (mps > 0 || blockDelta > 0) {
      steps.push({ mps, blockDelta });
    }
  }
  return steps;
}

export function decodeAuctionConfig(configData: Hex): { params: AuctionParameters; steps: AuctionStep[] } {
  try {
    const decoded = decodeAbiParameters(
      parseAbiParameters('(address,address,address,uint64,uint64,uint64,uint256,address,uint256,uint128,bytes)'),
      configData
    )[0] as [Address, Address, Address, bigint, bigint, bigint, bigint, Address, bigint, bigint, Hex];

    const params: AuctionParameters = {
      currency: decoded[0],
      tokensRecipient: decoded[1],
      fundsRecipient: decoded[2],
      startBlock: decoded[3],
      endBlock: decoded[4],
      claimBlock: decoded[5],
      tickSpacing: decoded[6],
      validationHook: decoded[7],
      floorPrice: decoded[8],
      requiredCurrencyRaised: decoded[9],
    };

    const steps = decodeAuctionSteps(decoded[10]);
    return { params, steps };
  } catch {
    throw new Error('Failed to decode auction config data');
  }
}

function decodeAdvancedLBPConfigData(configData: Hex): {
  migratorParams: MigratorParameters;
  createOneSidedTokenPosition: boolean;
  createOneSidedCurrencyPosition: boolean;
  auctionParams: AuctionParameters;
  auctionSteps: AuctionStep[];
} | null {
  try {
    const decoded = decodeAbiParameters(
      parseAbiParameters('uint64,address,uint24,int24,uint24,address,address,uint64,address,uint128,bool,bool,bytes'),
      configData
    );

    const migratorParams: MigratorParameters = {
      migrationBlock: decoded[0] as bigint,
      currency: decoded[1] as Address,
      poolLPFee: Number(decoded[2]),
      poolTickSpacing: Number(decoded[3]),
      tokenSplit: Number(decoded[4]),
      initializerFactory: decoded[5] as Address,
      positionRecipient: decoded[6] as Address,
      sweepBlock: decoded[7] as bigint,
      operator: decoded[8] as Address,
      maxCurrencyAmountForLP: decoded[9] as bigint,
    };

    const createOneSidedTokenPosition = decoded[10] as boolean;
    const createOneSidedCurrencyPosition = decoded[11] as boolean;
    const auctionParamsEncoded = decoded[12] as Hex;

    const { params: auctionParams, steps: auctionSteps } = decodeAuctionConfig(auctionParamsEncoded);

    return { migratorParams, createOneSidedTokenPosition, createOneSidedCurrencyPosition, auctionParams, auctionSteps };
  } catch {
    try {
      const decoded = decodeAbiParameters(
        parseAbiParameters('(uint64,address,uint24,int24,uint24,address,address,uint64,address,uint128),bool,bool,bytes'),
        configData
      );

      const migratorTuple = decoded[0] as readonly [bigint, Address, number, number, number, Address, Address, bigint, Address, bigint];
      const migratorParams: MigratorParameters = {
        migrationBlock: migratorTuple[0],
        currency: migratorTuple[1],
        poolLPFee: Number(migratorTuple[2]),
        poolTickSpacing: Number(migratorTuple[3]),
        tokenSplit: Number(migratorTuple[4]),
        initializerFactory: migratorTuple[5],
        positionRecipient: migratorTuple[6],
        sweepBlock: migratorTuple[7],
        operator: migratorTuple[8],
        maxCurrencyAmountForLP: migratorTuple[9],
      };

      const createOneSidedTokenPosition = decoded[1] as boolean;
      const createOneSidedCurrencyPosition = decoded[2] as boolean;
      const auctionParamsEncoded = decoded[3] as Hex;

      const { params: auctionParams, steps: auctionSteps } = decodeAuctionConfig(auctionParamsEncoded);

      return { migratorParams, createOneSidedTokenPosition, createOneSidedCurrencyPosition, auctionParams, auctionSteps };
    } catch {
      return null;
    }
  }
}

function tryManualAdvancedLBPDecode(configData: Hex): {
  migratorParams: MigratorParameters;
  createOneSidedTokenPosition: boolean;
  createOneSidedCurrencyPosition: boolean;
} | null {
  try {
    const data = configData.slice(2);
    if (data.length < 64 * 12) return null;

    const getSlot = (index: number): string => data.slice(index * 64, (index + 1) * 64);
    const slotToBigInt = (slot: string): bigint => BigInt('0x' + slot);
    const slotToAddress = (slot: string): Address => ('0x' + slot.slice(24)) as Address;
    const slotToNumber = (slot: string): number => Number(BigInt('0x' + slot));
    const slotToBool = (slot: string): boolean => slotToBigInt(slot) !== BigInt(0);

    const migratorParams: MigratorParameters = {
      migrationBlock: slotToBigInt(getSlot(0)),
      currency: slotToAddress(getSlot(1)),
      poolLPFee: slotToNumber(getSlot(2)),
      poolTickSpacing: slotToNumber(getSlot(3)),
      tokenSplit: slotToNumber(getSlot(4)),
      initializerFactory: slotToAddress(getSlot(5)),
      positionRecipient: slotToAddress(getSlot(6)),
      sweepBlock: slotToBigInt(getSlot(7)),
      operator: slotToAddress(getSlot(8)),
      maxCurrencyAmountForLP: slotToBigInt(getSlot(9)),
    };

    const createOneSidedTokenPosition = slotToBool(getSlot(10));
    const createOneSidedCurrencyPosition = slotToBool(getSlot(11));

    if (migratorParams.migrationBlock === BigInt(0) && migratorParams.sweepBlock === BigInt(0)) return null;

    return { migratorParams, createOneSidedTokenPosition, createOneSidedCurrencyPosition };
  } catch {
    return null;
  }
}

const ownerOnlyAbi = [
  { type: 'function', name: 'owner', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;
const minterOnlyAbi = [
  { type: 'function', name: 'minter', inputs: [], outputs: [{ type: 'address' }], stateMutability: 'view' },
] as const;

async function checkTokenMintability(client: PublicClient, tokenAddress: Address): Promise<TokenMintInfo> {
  const result: TokenMintInfo = { isMintable: false, hasOwner: false, owner: null, mintFunctions: [] };

  try {
    // Try standard Ownable.owner()
    try {
      const owner = await client.readContract({ address: tokenAddress, abi: ownerOnlyAbi, functionName: 'owner' });
      const addr = owner as Address;
      if (addr && addr !== '0x0000000000000000000000000000000000000000') {
        result.hasOwner = true;
        result.owner = addr;
      }
    } catch { /* No owner function */ }

    // Fallback: some mintable tokens expose minter() instead of owner()
    if (!result.hasOwner) {
      try {
        const minter = await client.readContract({ address: tokenAddress, abi: minterOnlyAbi, functionName: 'minter' });
        const addr = minter as Address;
        if (addr && addr !== '0x0000000000000000000000000000000000000000') {
          result.hasOwner = true;
          result.owner = addr;
        }
      } catch { /* No minter function */ }
    }

    const bytecode = await client.getBytecode({ address: tokenAddress });
    if (bytecode) {
      const bytecodeHex = bytecode.toLowerCase();
      for (const [funcName, selector] of Object.entries(MINT_SELECTORS)) {
        const selectorHex = selector.slice(2).toLowerCase();
        if (bytecodeHex.includes(selectorHex)) {
          result.mintFunctions.push(funcName);
          result.isMintable = true;
        }
      }
    }
  } catch { /* Could not check mintability */ }

  return result;
}

/**
 * Computes supply breakdown: auction, pool, and owner-retained amounts/percentages.
 * poolAmount/poolPercent are only non-zero when poolInfo is set (LiquidityLauncher flow with tokenSplit > 0).
 * For CCA-only auctions (no pool), poolAmount and poolPercent correctly stay 0.
 */
export function calculateTokenSupplyInfo(
  totalSupply: bigint,
  auctionAmount: bigint,
  poolInfo: PoolInfo | undefined,
  totalDistributed: bigint
): TokenSupplyInfo {
  let poolAmount = BigInt(0);

  if (poolInfo && poolInfo.migratorParams.tokenSplit > 0) {
    const tokenSplit = BigInt(poolInfo.migratorParams.tokenSplit);
    const MPS_TOTAL = BigInt(10_000_000);
    const auctionFromSplit = (totalDistributed * tokenSplit) / MPS_TOTAL;
    poolAmount = totalDistributed - auctionFromSplit;
  }

  const ownerRetained = totalSupply - totalDistributed;
  const totalSupplyNum = Number(totalSupply);
  const auctionPercent = totalSupplyNum > 0 ? (Number(auctionAmount) / totalSupplyNum) * 100 : 0;
  const poolPercent = totalSupplyNum > 0 ? (Number(poolAmount) / totalSupplyNum) * 100 : 0;
  const ownerPercent = totalSupplyNum > 0 ? (Number(ownerRetained) / totalSupplyNum) * 100 : 0;

  return { totalSupply, totalDistributed, auctionAmount, poolAmount, ownerRetained, auctionPercent, poolPercent, ownerPercent };
}

// ============================================================================
// Main Fetch Functions
// ============================================================================

/**
 * Fetch auction info from an auction contract address.
 * Uses Etherscan API to find creation tx, then delegates to fetchAuctionInfoFromTx.
 */
export async function fetchAuctionInfoFromAddress(auctionAddress: Address, chainId: number): Promise<AuctionInfo> {
  const txHash = await getContractCreationTxHash(auctionAddress, chainId);
  return fetchAuctionInfoFromTx(txHash, chainId);
}

/**
 * Fetch auction info from a creation transaction hash
 */
export async function fetchAuctionInfoFromTx(txHash: Hex, chainId: number = 84532): Promise<AuctionInfo> {
  const config = SUPPORTED_CHAINS[chainId];
  if (!config) throw new Error(`Unsupported chain ID: ${chainId}. Supported: ${SUPPORTED_CHAIN_IDS.join(', ')}`);

  const client = getClient(chainId);

  const [tx, receipt, currentBlock] = await Promise.all([
    client.getTransaction({ hash: txHash }),
    client.getTransactionReceipt({ hash: txHash }),
    client.getBlockNumber(),
  ]);

  if (!tx || !receipt) throw new Error(`Transaction not found: ${txHash}`);

  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const txTimestamp = new Date(Number(block.timestamp) * 1000);

  const toAddress = tx.to?.toLowerCase() || '';
  const calledVia = getContractName(toAddress as Address) as 'LiquidityLauncher' | 'CCAFactory' | 'Unknown';

  const auctionCreatedTopic = '0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9';
  const auctionLog = receipt.logs.find((log) => log.topics[0] === auctionCreatedTopic);
  if (!auctionLog) throw new Error('AuctionCreated event not found in transaction');

  const factoryAddress = auctionLog.address as Address;
  const auctionAddress = ('0x' + auctionLog.topics[1]!.slice(26)) as Address;
  const tokenAddress = ('0x' + auctionLog.topics[2]!.slice(26)) as Address;

  const decodedEventData = decodeAbiParameters(parseAbiParameters('uint256 amount, bytes configData'), auctionLog.data);
  const auctionAmount = decodedEventData[0] as bigint;
  const configData = decodedEventData[1] as Hex;

  const { params, steps } = decodeAuctionConfig(configData);

  const [tokenName, tokenSymbol, tokenDecimals, tokenTotalSupply, tokenMintInfo] = await Promise.all([
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'name' }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: 'totalSupply' }),
    checkTokenMintability(client, tokenAddress),
  ]);

  let totalDistributed = auctionAmount;
  const durationBlocks = Number(params.endBlock - params.startBlock);
  const durationSeconds = durationBlocks * config.blockTimeSeconds;

  const timeInfo: TimeInfo = {
    startTime: blockToTime(params.startBlock, receipt.blockNumber, txTimestamp, config.blockTimeSeconds),
    endTime: blockToTime(params.endBlock, receipt.blockNumber, txTimestamp, config.blockTimeSeconds),
    claimTime: blockToTime(params.claimBlock, receipt.blockNumber, txTimestamp, config.blockTimeSeconds),
    durationSeconds,
    durationFormatted: formatDuration(durationSeconds),
  };

  let auctionStatus: 'planned' | 'active' | 'ended' | 'claimable';
  if (currentBlock < params.startBlock) auctionStatus = 'planned';
  else if (currentBlock < params.endBlock) auctionStatus = 'active';
  else if (currentBlock < params.claimBlock) auctionStatus = 'ended';
  else auctionStatus = 'claimable';

  let willCreatePool = false;
  let poolInfo: PoolInfo | undefined;

  if (calledVia === 'LiquidityLauncher') {
    const distInitTopic = '0x0afd26d7f0833a451173acef122d058906aa7708ceb6f67ea7471a649d88b44b';
    const distLog = receipt.logs.find((log) => log.topics[0] === distInitTopic);

    if (distLog) {
      const distributionContract = ('0x' + distLog.topics[1]!.slice(26)) as Address;
      if (distributionContract.toLowerCase() !== auctionAddress.toLowerCase()) {
        willCreatePool = true;

        try {
          const decoded = decodeFunctionData({ abi: liquidityLauncherAbi, data: tx.input });

          if (decoded.functionName === 'distributeToken') {
            const args = decoded.args as [Address, { strategy: Address; amount: bigint; configData: Hex }, boolean, Hex];
            const strategyFactory = args[1].strategy;
            const originalConfigData = args[1].configData;
            totalDistributed = args[1].amount;

            const advancedLBPData = decodeAdvancedLBPConfigData(originalConfigData);

            if (advancedLBPData) {
              poolInfo = {
                strategyFactory,
                strategyFactoryName: getStrategyFactoryName(strategyFactory),
                distributionContract,
                migratorParams: advancedLBPData.migratorParams,
                createOneSidedTokenPosition: advancedLBPData.createOneSidedTokenPosition,
                createOneSidedCurrencyPosition: advancedLBPData.createOneSidedCurrencyPosition,
              };
            } else {
              const manualDecoded = tryManualAdvancedLBPDecode(originalConfigData);
              poolInfo = {
                strategyFactory,
                strategyFactoryName: getStrategyFactoryName(strategyFactory),
                distributionContract,
                migratorParams: manualDecoded?.migratorParams || {
                  migrationBlock: BigInt(0), currency: '0x0000000000000000000000000000000000000000' as Address,
                  poolLPFee: 0, poolTickSpacing: 0, tokenSplit: 0,
                  initializerFactory: '0x0000000000000000000000000000000000000000' as Address,
                  positionRecipient: '0x0000000000000000000000000000000000000000' as Address,
                  sweepBlock: BigInt(0), operator: '0x0000000000000000000000000000000000000000' as Address,
                  maxCurrencyAmountForLP: BigInt(0),
                },
                createOneSidedTokenPosition: manualDecoded?.createOneSidedTokenPosition || false,
                createOneSidedCurrencyPosition: manualDecoded?.createOneSidedCurrencyPosition || false,
              };
            }
          }
        } catch { /* Could not decode transaction input */ }
      }
    }
  }

  const tokenSupplyInfo = calculateTokenSupplyInfo(tokenTotalSupply as bigint, auctionAmount, poolInfo, totalDistributed);
  const extraFundsDestination: 'pool' | 'creator' = willCreatePool ? 'pool' : 'creator';

  return {
    txHash, chainId, chainName: config.name, blockNumber: receipt.blockNumber, timestamp: txTimestamp,
    from: tx.from, to: tx.to as Address, blockTimeSeconds: config.blockTimeSeconds,
    calledVia, willCreatePool, poolInfo, extraFundsDestination, factoryAddress, auctionAddress, auctionAmount,
    tokenAddress, tokenName: tokenName as string, tokenSymbol: tokenSymbol as string,
    tokenDecimals: tokenDecimals as number, tokenTotalSupply: tokenTotalSupply as bigint,
    tokenSupplyInfo, tokenMintInfo, parameters: params, auctionSteps: steps, timeInfo,
    currentBlock, auctionStatus,
  };
}

/**
 * Fetch auction info from auction address (current on-chain state)
 */
export async function fetchAuctionOnChainInfo(auctionAddress: Address, chainId: number): Promise<AuctionOnChainInfo> {
  const client = getClient(chainId);
  const config = SUPPORTED_CHAINS[chainId];

  const [
    tokenAddress, currencyAddress, startBlock, endBlock, claimBlock, floorPrice,
    requiredCurrencyRaised, fundsRecipient, tokensRecipient, clearingPrice,
    totalTokensForSale, totalCurrencyRaised, currentBlock,
  ] = await Promise.all([
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'token' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'currency' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'startBlock' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'endBlock' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'claimBlock' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'floorPrice' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'requiredCurrencyRaised' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'fundsRecipient' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'tokensRecipient' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'clearingPrice' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'totalTokensForSale' }),
    client.readContract({ address: auctionAddress, abi: ccaAuctionAbi, functionName: 'totalCurrencyRaised' }),
    client.getBlockNumber(),
  ]);

  const [tokenName, tokenSymbol, tokenDecimals, tokenTotalSupply] = await Promise.all([
    client.readContract({ address: tokenAddress as Address, abi: erc20Abi, functionName: 'name' }),
    client.readContract({ address: tokenAddress as Address, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: tokenAddress as Address, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address: tokenAddress as Address, abi: erc20Abi, functionName: 'totalSupply' }),
  ]);

  const now = new Date();
  const startTime = blockToTime(startBlock as bigint, currentBlock, now, config.blockTimeSeconds);
  const endTime = blockToTime(endBlock as bigint, currentBlock, now, config.blockTimeSeconds);

  let status: 'planned' | 'active' | 'graduated' | 'ended' | 'claimable';
  if (currentBlock < (startBlock as bigint)) status = 'planned';
  else if (currentBlock < (endBlock as bigint)) status = 'active';
  else if (currentBlock < (claimBlock as bigint)) status = 'ended';
  else status = 'claimable';

  return {
    tokenAddress: tokenAddress as Address, currencyAddress: currencyAddress as Address,
    startBlock: startBlock as bigint, endBlock: endBlock as bigint, claimBlock: claimBlock as bigint,
    floorPrice: floorPrice as bigint, requiredCurrencyRaised: requiredCurrencyRaised as bigint,
    fundsRecipient: fundsRecipient as Address, tokensRecipient: tokensRecipient as Address,
    clearingPrice: clearingPrice as bigint, totalTokensForSale: totalTokensForSale as bigint,
    totalCurrencyRaised: totalCurrencyRaised as bigint,
    tokenName: tokenName as string, tokenSymbol: tokenSymbol as string,
    tokenDecimals: tokenDecimals as number, tokenTotalSupply: tokenTotalSupply as bigint,
    startTime, endTime, currentBlock, status,
  };
}

export function isChainSupported(chainId: number): boolean {
  return isChainSupportedInConfig(chainId);
}

// ============================================================================
// Output Formatting (for CLI)
// ============================================================================

const TOKEN_INFO_LABELS: Record<keyof EtherscanTokenInfo, string> = {
  website: 'Website',
  twitter: 'Twitter',
  discord: 'Discord',
  telegram: 'Telegram',
  github: 'GitHub',
  reddit: 'Reddit',
  facebook: 'Facebook',
  blog: 'Blog',
  linkedin: 'LinkedIn',
  whitepaper: 'Whitepaper',
};

export function printAuctionInfo(
  info: AuctionInfo,
  explorerUrl: string,
  tokenInfo?: EtherscanTokenInfo | CoinGeckoTokenInfo | null,
): void {
  const divider = '═'.repeat(70);
  const subDivider = '─'.repeat(70);

  console.log('\n' + divider);
  console.log('  CCA AUCTION INFO');
  console.log(divider);

  console.log('\n📋 TRANSACTION');
  console.log(subDivider);
  console.log(`  Hash:         ${info.txHash}`);
  console.log(`  Chain:        ${info.chainName} (${info.chainId})`);
  console.log(`  Block:        ${info.blockNumber}`);
  console.log(`  Timestamp:    ${info.timestamp.toISOString()}`);
  console.log(`  From:         ${info.from}`);
  console.log(`  To:           ${info.to}`);
  console.log(`  Block Time:   ~${info.blockTimeSeconds} seconds/block`);
  console.log(`  Explorer:     ${explorerUrl}/tx/${info.txHash}`);

  console.log('\n📦 DISTRIBUTION STRATEGY');
  console.log(subDivider);
  console.log(`  Called Via:   ${info.calledVia}`);
  console.log(`  Will Create Pool: ${info.willCreatePool ? 'Yes' : 'No (standalone auction)'}`);

  if (info.poolInfo) {
    console.log(`  Strategy Factory: ${info.poolInfo.strategyFactory}`);
    console.log(`  Strategy Type:    ${info.poolInfo.strategyFactoryName}`);
    console.log(`  Distribution Contract: ${info.poolInfo.distributionContract}`);
  }

  console.log('\n🪙 TOKEN');
  console.log(subDivider);
  console.log(`  Address:      ${info.tokenAddress}`);
  console.log(`  Name:         ${info.tokenName}`);
  console.log(`  Symbol:       ${info.tokenSymbol}`);
  console.log(`  Decimals:     ${info.tokenDecimals}`);
  console.log(`  Total Supply: ${formatUnits(info.tokenTotalSupply, info.tokenDecimals)} ${info.tokenSymbol}`);
  console.log(`  Explorer:     ${explorerUrl}/token/${info.tokenAddress}`);

  console.log('\n🌐 WEBSITE & SOCIALS');
  console.log(subDivider);
  if (tokenInfo) {
    const linkKeys = new Set<keyof EtherscanTokenInfo>(['website', 'twitter', 'discord', 'telegram', 'github', 'reddit', 'facebook', 'blog', 'linkedin', 'whitepaper']);
    const entries = (Object.entries(tokenInfo) as [keyof EtherscanTokenInfo, string | null][]).filter(
      ([key, v]) => linkKeys.has(key) && v != null && v !== '',
    );
    if (entries.length > 0) {
      for (const [key, value] of entries) {
        const label = TOKEN_INFO_LABELS[key];
        console.log(`  ${label}:       ${value}`);
      }
    }
    const extended = tokenInfo as CoinGeckoTokenInfo | undefined;
    const hasExtended = extended?.description || extended?.image || (extended?.categories?.length ?? 0) > 0;
    if (entries.length === 0 && !hasExtended) {
      console.log('  (no links or metadata for this contract)');
    }
    if (hasExtended && extended?.description) {
      const maxLen = 400;
      const text = extended.description.length > maxLen ? `${extended.description.slice(0, maxLen)}...` : extended.description;
      console.log('\n📝 DESCRIPTION');
      console.log(subDivider);
      console.log(`  ${text.split('\n').join('\n  ')}`);
    }
    if (hasExtended && extended?.image) {
      console.log('\n🖼️  IMAGE');
      console.log(subDivider);
      console.log(`  ${extended.image}`);
    }
    if (hasExtended && extended?.categories?.length) {
      console.log('\n🏷️  CATEGORIES');
      console.log(subDivider);
      console.log(`  ${extended.categories.join(', ')}`);
    }
  } else {
    console.log('  (not available — set COINGECKO_DEMO_API_KEY in .env.local; get free key at https://www.coingecko.com/en/developers/dashboard)');
  }

  console.log('\n🔐 TOKEN MINTABILITY');
  console.log(subDivider);
  console.log(`  Is Mintable:  ${info.tokenMintInfo.isMintable ? '⚠️  YES (new tokens can be minted)' : '✅ NO (fixed supply)'}`);
  if (info.tokenMintInfo.mintFunctions.length > 0) {
    console.log(`  Mint Functions: ${info.tokenMintInfo.mintFunctions.join(', ')}`);
  }
  console.log(`  Has Owner:    ${info.tokenMintInfo.hasOwner ? 'Yes' : 'No'}`);
  if (info.tokenMintInfo.owner) {
    console.log(`  Owner Address: ${info.tokenMintInfo.owner}`);
  }

  const supply = info.tokenSupplyInfo;
  console.log('\n📊 TOKEN SUPPLY DISTRIBUTION');
  console.log(subDivider);
  console.log(`  Total Supply:      ${formatUnits(supply.totalSupply, info.tokenDecimals)} ${info.tokenSymbol} (100%)`);
  console.log(`  Total Distributed: ${formatUnits(supply.totalDistributed, info.tokenDecimals)} ${info.tokenSymbol} (${(Number(supply.totalDistributed) / Number(supply.totalSupply) * 100).toFixed(2)}%)`);
  console.log(`  ├─ To Auction:     ${formatUnits(supply.auctionAmount, info.tokenDecimals)} ${info.tokenSymbol} (${supply.auctionPercent.toFixed(2)}%)`);
  if (supply.poolAmount > BigInt(0)) {
    console.log(`  └─ To Pool:        ${formatUnits(supply.poolAmount, info.tokenDecimals)} ${info.tokenSymbol} (${supply.poolPercent.toFixed(2)}%)`);
  }
  console.log(`  Owner Retained:    ${formatUnits(supply.ownerRetained, info.tokenDecimals)} ${info.tokenSymbol} (${supply.ownerPercent.toFixed(2)}%)`);

  console.log('\n🔨 AUCTION');
  console.log(subDivider);
  const factoryLabel = getContractName(info.factoryAddress);
  console.log(`  Factory:      ${info.factoryAddress}${factoryLabel !== 'Unknown Contract' ? ` (${factoryLabel})` : ''}`);
  console.log(`  Address:      ${info.auctionAddress}`);
  console.log(`  Amount:       ${formatUnits(info.auctionAmount, info.tokenDecimals)} ${info.tokenSymbol}`);
  console.log(`  Status:       ${info.auctionStatus.toUpperCase()}`);
  console.log(`  Current Block: ${info.currentBlock}`);
  console.log(`  Auction:     ${explorerUrl}/address/${info.auctionAddress}`);
  console.log(`  Factory:     ${explorerUrl}/address/${info.factoryAddress}`);

  const p = info.parameters;
  const currencySymbol = getCurrencySymbol(p.currency, info.chainId);

  console.log('\n⚙️ AUCTION PARAMETERS');
  console.log(subDivider);
  console.log(`  Currency:     ${p.currency === '0x0000000000000000000000000000000000000000' ? 'Native ETH' : p.currency} (${currencySymbol})`);
  console.log(`  Floor Price:  ${formatQ96Price(p.floorPrice)} ${currencySymbol}/${info.tokenSymbol} (Q96: ${p.floorPrice})`);
  console.log(`  Tick Spacing: ${p.tickSpacing} (Q96)`);
  console.log(`  Required Raised: ${p.requiredCurrencyRaised === BigInt(0) ? 'None' : formatUnits(p.requiredCurrencyRaised, 18) + ' ' + currencySymbol}`);
  console.log(`  Tokens Recipient:  ${p.tokensRecipient}`);
  console.log(`  Funds Recipient:   ${p.fundsRecipient}`);
  console.log(`  Validation Hook:   ${p.validationHook === '0x0000000000000000000000000000000000000000' ? 'None' : p.validationHook}`);

  console.log('\n⏰ AUCTION TIMELINE');
  console.log(subDivider);
  console.log(`  Start Block:  ${p.startBlock}`);
  console.log(`  Start Time:   ${info.timeInfo.startTime.toISOString()} (${info.timeInfo.startTime.toLocaleString()})`);
  console.log(`  End Block:    ${p.endBlock}`);
  console.log(`  End Time:     ${info.timeInfo.endTime.toISOString()} (${info.timeInfo.endTime.toLocaleString()})`);
  console.log(`  Claim Block:  ${p.claimBlock}`);
  console.log(`  Claim Time:   ${info.timeInfo.claimTime.toISOString()} (${info.timeInfo.claimTime.toLocaleString()})`);
  console.log(`  Duration:     ${Number(p.endBlock - p.startBlock)} blocks (${info.timeInfo.durationFormatted})`);

  console.log('\n📊 AUCTION STEPS (Token Release Schedule)');
  console.log(subDivider);
  let totalMps = 0;
  let totalBlocks = 0;
  info.auctionSteps.forEach((step, i) => {
    const stepMps = step.mps * step.blockDelta;
    totalMps += stepMps;
    totalBlocks += step.blockDelta;
    const percentage = (stepMps / 10_000_000 * 100).toFixed(2);
    const stepDuration = formatDuration(step.blockDelta * info.blockTimeSeconds);
    console.log(`  Step ${i + 1}: ${step.mps.toLocaleString()} MPS × ${step.blockDelta} blocks (${stepDuration}) = ${percentage}%`);
  });
  console.log(subDivider);
  console.log(`  Total: ${(totalMps / 10_000_000 * 100).toFixed(2)}% over ${totalBlocks} blocks (${info.timeInfo.durationFormatted})`);

  if (info.poolInfo && info.poolInfo.migratorParams.migrationBlock > BigInt(0)) {
    const mp = info.poolInfo.migratorParams;
    const poolCurrency = getCurrencySymbol(mp.currency, info.chainId);
    const migrationTime = blockToTime(mp.migrationBlock, info.blockNumber, info.timestamp, info.blockTimeSeconds);
    const sweepTime = blockToTime(mp.sweepBlock, info.blockNumber, info.timestamp, info.blockTimeSeconds);

    console.log('\n🏊 POOL CONFIGURATION (Post-Auction)');
    console.log(subDivider);
    console.log(`  Pool Currency:    ${mp.currency === '0x0000000000000000000000000000000000000000' ? 'Native ETH' : mp.currency} (${poolCurrency})`);
    console.log(`  Pool LP Fee:      ${mp.poolLPFee / 10000}% (${mp.poolLPFee} bps)`);
    console.log(`  Pool Tick Spacing: ${mp.poolTickSpacing}`);
    console.log(`  Token Split:      ${(mp.tokenSplit / 10_000_000 * 100).toFixed(2)}% to auction (${mp.tokenSplit} MPS)`);
    console.log(`  Migration Block:  ${mp.migrationBlock}`);
    console.log(`  Migration Time:   ${migrationTime.toISOString()} (${migrationTime.toLocaleString()})`);
    console.log(`  Sweep Block:      ${mp.sweepBlock}`);
    console.log(`  Sweep Time:       ${sweepTime.toISOString()} (${sweepTime.toLocaleString()})`);
    console.log(`  Position Recipient: ${mp.positionRecipient}`);
    console.log(`  Operator:         ${mp.operator}`);
    console.log(`  Initializer Factory: ${mp.initializerFactory}`);
    const MAX_UINT128 = BigInt('340282366920938463463374607431768211455');
    console.log(`  Max Currency for LP: ${mp.maxCurrencyAmountForLP === MAX_UINT128 ? 'Unlimited (max uint128)' : formatUnits(mp.maxCurrencyAmountForLP, 18) + ' ' + poolCurrency}`);
    console.log(`  Create One-Sided Token Position:    ${info.poolInfo.createOneSidedTokenPosition ? 'Yes' : 'No'}`);
    console.log(`  Create One-Sided Currency Position: ${info.poolInfo.createOneSidedCurrencyPosition ? 'Yes' : 'No'}`);
  }

  console.log('\n📈 CURRENT STATUS');
  console.log(subDivider);
  const now = new Date();

  switch (info.auctionStatus) {
    case 'planned': {
      const blocksUntilStart = Number(p.startBlock - info.currentBlock);
      const timeUntilStart = Math.max(0, Math.floor((info.timeInfo.startTime.getTime() - now.getTime()) / 1000));
      console.log(`  Auction has NOT STARTED yet`);
      console.log(`  Starts in: ${blocksUntilStart} blocks (~${formatDuration(timeUntilStart)})`);
      break;
    }
    case 'active': {
      const blocksPassed = Number(info.currentBlock - p.startBlock);
      const blocksRemaining = Number(p.endBlock - info.currentBlock);
      const timeRemaining = Math.max(0, Math.floor((info.timeInfo.endTime.getTime() - now.getTime()) / 1000));
      console.log(`  Auction is LIVE`);
      console.log(`  Progress: ${blocksPassed} / ${Number(p.endBlock - p.startBlock)} blocks`);
      console.log(`  Remaining: ${blocksRemaining} blocks (~${formatDuration(timeRemaining)})`);
      break;
    }
    case 'ended': {
      const blocksUntilClaim = Number(p.claimBlock - info.currentBlock);
      const timeUntilClaim = Math.max(0, Math.floor((info.timeInfo.claimTime.getTime() - now.getTime()) / 1000));
      console.log(`  Auction has ENDED`);
      console.log(`  Claiming opens in: ${blocksUntilClaim} blocks (~${formatDuration(timeUntilClaim)})`);
      break;
    }
    case 'claimable': {
      console.log(`  Auction is CLAIMABLE`);
      console.log(`  Winners can claim their tokens`);
      if (info.poolInfo && info.poolInfo.migratorParams.migrationBlock > BigInt(0)) {
        const mp = info.poolInfo.migratorParams;
        if (info.currentBlock < mp.migrationBlock) {
          const blocksUntilMigration = Number(mp.migrationBlock - info.currentBlock);
          const migrationTime = blockToTime(mp.migrationBlock, info.blockNumber, info.timestamp, info.blockTimeSeconds);
          const timeUntilMigration = Math.max(0, Math.floor((migrationTime.getTime() - now.getTime()) / 1000));
          console.log(`  Pool migration in: ${blocksUntilMigration} blocks (~${formatDuration(timeUntilMigration)})`);
        } else if (info.currentBlock < mp.sweepBlock) {
          console.log(`  Pool migration: AVAILABLE`);
          const blocksUntilSweep = Number(mp.sweepBlock - info.currentBlock);
          console.log(`  Sweep available in: ${blocksUntilSweep} blocks`);
        } else {
          console.log(`  Pool migration: AVAILABLE`);
          console.log(`  Sweep: AVAILABLE`);
        }
      }
      break;
    }
  }

  console.log('\n' + divider + '\n');
}
