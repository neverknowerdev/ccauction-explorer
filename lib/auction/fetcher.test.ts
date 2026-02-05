import { describe, it, expect, vi, beforeEach } from 'vitest';

// We'll test the pure/helper functions that don't require RPC calls
// and mock the RPC-dependent functions

// Mock viem
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(),
  };
});

// Import after mocking
import {
  decodeAuctionSteps,
  decodeAuctionConfig,
  formatDuration,
  formatQ96Price,
  getCurrencySymbol,
  getContractName,
  getStrategyFactoryName,
  calculateTokenSupplyInfo,
  type AuctionStep,
  type AuctionParameters,
  type PoolInfo,
} from './fetcher';

describe('decodeAuctionSteps', () => {
  it('should decode packed auction steps', () => {
    // Each step is 8 bytes (16 hex chars): 3 bytes MPS + 5 bytes blockDelta
    // MPS=1000000 (0x0F4240), blockDelta=100 (0x0000000064)
    // Packed: 0F4240 + 0000000064 = 0x0F42400000000064
    const data = '0x0F42400000000064' as `0x${string}`;
    const steps = decodeAuctionSteps(data);

    expect(steps).toHaveLength(1);
    expect(steps[0].mps).toBe(1000000);
    expect(steps[0].blockDelta).toBe(100);
  });

  it('should decode multiple steps', () => {
    // Two steps: MPS=500000, blockDelta=50 and MPS=1000000, blockDelta=100
    // Step 1: 0x07A120 + 0x0000000032 = 0x07A1200000000032
    // Step 2: 0x0F4240 + 0x0000000064 = 0x0F42400000000064
    const data = '0x07A12000000000320F42400000000064' as `0x${string}`;
    const steps = decodeAuctionSteps(data);

    expect(steps).toHaveLength(2);
    expect(steps[0].mps).toBe(500000);
    expect(steps[0].blockDelta).toBe(50);
    expect(steps[1].mps).toBe(1000000);
    expect(steps[1].blockDelta).toBe(100);
  });

  it('should skip zero steps', () => {
    const data = '0x00000000000000000F42400000000064' as `0x${string}`;
    const steps = decodeAuctionSteps(data);

    expect(steps).toHaveLength(1);
    expect(steps[0].mps).toBe(1000000);
  });

  it('should handle empty data', () => {
    const data = '0x' as `0x${string}`;
    const steps = decodeAuctionSteps(data);
    expect(steps).toHaveLength(0);
  });
});

describe('formatDuration', () => {
  it('should format seconds', () => {
    expect(formatDuration(45)).toBe('45 seconds');
  });

  it('should format minutes', () => {
    expect(formatDuration(120)).toBe('2 minutes');
    expect(formatDuration(150)).toBe('2 min 30 sec');
  });

  it('should format hours', () => {
    expect(formatDuration(3600)).toBe('1 hours');
    expect(formatDuration(5400)).toBe('1 hr 30 min');
  });

  it('should format days', () => {
    expect(formatDuration(86400)).toBe('1 days');
    expect(formatDuration(90000)).toBe('1 days 1 hr');
  });
});

describe('formatQ96Price', () => {
  it('should format Q96 price to decimal', () => {
    // Q96 = 2^96 = 79228162514264337593543950336
    // Price of 1.0 in Q96 format
    const Q96 = BigInt(2) ** BigInt(96);
    const result = formatQ96Price(Q96);
    expect(result).toBe('1.000000000000000000');
  });

  it('should format zero price', () => {
    const result = formatQ96Price(BigInt(0));
    expect(result).toBe('0.000000000000000000');
  });

  it('should format small price', () => {
    const Q96 = BigInt(2) ** BigInt(96);
    const halfPrice = Q96 / BigInt(2);
    const result = formatQ96Price(halfPrice);
    expect(result).toBe('0.500000000000000000');
  });
});

describe('getCurrencySymbol', () => {
  it('should return ETH for zero address', () => {
    const result = getCurrencySymbol('0x0000000000000000000000000000000000000000', 1);
    expect(result).toBe('ETH');
  });

  it('should return USDC for mainnet USDC', () => {
    const result = getCurrencySymbol('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 1);
    expect(result).toBe('USDC');
  });

  it('should return USDC for Base USDC', () => {
    const result = getCurrencySymbol('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 8453);
    expect(result).toBe('USDC');
  });

  it('should return Unknown for unknown address', () => {
    const result = getCurrencySymbol('0x1234567890123456789012345678901234567890', 1);
    expect(result).toBe('Unknown');
  });

  it('should be case insensitive', () => {
    const result = getCurrencySymbol('0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48', 1);
    expect(result).toBe('USDC');
  });
});

describe('getContractName', () => {
  it('should return LiquidityLauncher for known address', () => {
    const result = getContractName('0x00000008412db3394c91a5cbd01635c6d140637c');
    expect(result).toBe('LiquidityLauncher');
  });

  it('should return CCAFactory for known address', () => {
    const result = getContractName('0xcca1101c61cf5cb44c968947985300df945c3565');
    expect(result).toBe('ContinuousClearingAuctionFactory');
  });

  it('should return Unknown Contract for unknown address', () => {
    const result = getContractName('0x1234567890123456789012345678901234567890');
    expect(result).toBe('Unknown Contract');
  });

  it('should be case insensitive', () => {
    const result = getContractName('0x00000008412DB3394C91A5CBD01635C6D140637C');
    expect(result).toBe('LiquidityLauncher');
  });
});

describe('getStrategyFactoryName', () => {
  it('should return AdvancedLBPStrategyFactory for known address', () => {
    const result = getStrategyFactoryName('0xbbbb6ffabccb1eafd4f0baed6764d8aa973316b6');
    expect(result).toBe('AdvancedLBPStrategyFactory');
  });

  it('should return FullRangeLBPStrategyFactory for known address', () => {
    const result = getStrategyFactoryName('0xa3a236647c80bcd69cad561acf863c29981b6fbc');
    expect(result).toBe('FullRangeLBPStrategyFactory');
  });

  it('should return Unknown Strategy for unknown address', () => {
    const result = getStrategyFactoryName('0x1234567890123456789012345678901234567890');
    expect(result).toBe('Unknown Strategy');
  });
});

describe('calculateTokenSupplyInfo', () => {
  const totalSupply = BigInt('1000000000000000000000000'); // 1M tokens (18 decimals)
  const auctionAmount = BigInt('500000000000000000000000'); // 500K tokens

  it('should calculate supply info without pool', () => {
    const result = calculateTokenSupplyInfo(totalSupply, auctionAmount, undefined, auctionAmount);

    expect(result.totalSupply).toBe(totalSupply);
    expect(result.auctionAmount).toBe(auctionAmount);
    expect(result.poolAmount).toBe(BigInt(0));
    expect(result.ownerRetained).toBe(BigInt('500000000000000000000000'));
    expect(result.auctionPercent).toBe(50);
    expect(result.poolPercent).toBe(0);
    expect(result.ownerPercent).toBe(50);
  });

  it('should calculate supply info with pool split', () => {
    const totalDistributed = BigInt('800000000000000000000000'); // 800K distributed
    const poolInfo: PoolInfo = {
      strategyFactory: '0x0000000000000000000000000000000000000000',
      strategyFactoryName: 'Test',
      distributionContract: '0x0000000000000000000000000000000000000000',
      migratorParams: {
        migrationBlock: BigInt(0),
        currency: '0x0000000000000000000000000000000000000000',
        poolLPFee: 0,
        poolTickSpacing: 0,
        tokenSplit: 5000000, // 50% to auction (5M MPS)
        initializerFactory: '0x0000000000000000000000000000000000000000',
        positionRecipient: '0x0000000000000000000000000000000000000000',
        sweepBlock: BigInt(0),
        operator: '0x0000000000000000000000000000000000000000',
        maxCurrencyAmountForLP: BigInt(0),
      },
      createOneSidedTokenPosition: false,
      createOneSidedCurrencyPosition: false,
    };

    const result = calculateTokenSupplyInfo(totalSupply, auctionAmount, poolInfo, totalDistributed);

    expect(result.totalDistributed).toBe(totalDistributed);
    // Pool gets 50% of distributed = 400K
    expect(result.poolAmount).toBe(BigInt('400000000000000000000000'));
    // Owner retained = 1M - 800K = 200K
    expect(result.ownerRetained).toBe(BigInt('200000000000000000000000'));
    expect(result.ownerPercent).toBe(20);
  });

  it('should handle zero total supply', () => {
    const result = calculateTokenSupplyInfo(BigInt(0), BigInt(0), undefined, BigInt(0));

    expect(result.auctionPercent).toBe(0);
    expect(result.poolPercent).toBe(0);
    expect(result.ownerPercent).toBe(0);
  });
});
