import { describe, it, expect, vi, beforeEach } from 'vitest';

// Store for mock data - must be defined before vi.mock
const mockState = {
  auctions: [] as any[],
  bids: [] as any[],
  clearingPriceHistory: [] as any[],
  auctionIdCounter: 1,
};

// Helper to reset mock data
function resetMockData() {
  mockState.auctions.length = 0;
  mockState.bids.length = 0;
  mockState.clearingPriceHistory.length = 0;
  mockState.auctionIdCounter = 1;
}

// Mock the database module with simpler implementation
vi.mock('@/lib/db', () => {
  const createSelectMock = () => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() =>
          Promise.resolve(mockState.auctions.map(a => ({ id: a.id })))
        ),
      }),
    }),
  });

  const createInsertMock = () => ({
    values: vi.fn().mockImplementation((values: any) => {
      const result = {
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockImplementation(() => {
            // For auctions
            if ('address' in values && 'chainId' in values && !('bidId' in values)) {
              const exists = mockState.auctions.find(
                a => a.chainId === values.chainId && a.address === values.address
              );
              if (exists) return Promise.resolve([]);
              const newAuction = { id: mockState.auctionIdCounter++, ...values };
              mockState.auctions.push(newAuction);
              return Promise.resolve([{ id: newAuction.id }]);
            }
            // For bids
            if ('bidId' in values && 'auctionId' in values) {
              const exists = mockState.bids.find(
                b => b.auctionId === values.auctionId && b.bidId === values.bidId
              );
              if (exists) return Promise.resolve([]);
              mockState.bids.push(values);
              return Promise.resolve([{ auctionId: values.auctionId, bidId: values.bidId }]);
            }
            return Promise.resolve([{ id: 1 }]);
          }),
        }),
      };

      // For clearing price history (no onConflictDoNothing)
      if ('clearingPrice' in values && 'auctionId' in values && 'time' in values) {
        mockState.clearingPriceHistory.push(values);
        return Promise.resolve();
      }

      return result;
    }),
  });

  const createUpdateMock = () => ({
    set: vi.fn().mockImplementation((values: any) => ({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          // Update bid if values has filledTokens
          if ('filledTokens' in values || (values.status && mockState.bids.length > 0 && !mockState.auctions.find(a => a.status))) {
            if (mockState.bids.length > 0) {
              Object.assign(mockState.bids[0], values);
              return Promise.resolve([{ bidId: mockState.bids[0].bidId }]);
            }
            return Promise.resolve([]);
          }
          // Update auction
          if (mockState.auctions.length > 0) {
            Object.assign(mockState.auctions[0], values);
            return Promise.resolve([{ id: mockState.auctions[0].id }]);
          }
          return Promise.resolve([]);
        }),
      }),
    })),
  });

  return {
    db: {
      select: vi.fn().mockImplementation(createSelectMock),
      insert: vi.fn().mockImplementation(createInsertMock),
      update: vi.fn().mockImplementation(createUpdateMock),
    },
    auctions: { id: 'id', chainId: 'chain_id', address: 'address' },
    bids: { auctionId: 'auction_id', bidId: 'bid_id' },
    clearingPriceHistory: { id: 'id', auctionId: 'auction_id' },
    // Query utilities
    getAuctionId: vi.fn().mockImplementation((chainId: number, auctionAddress: string) => {
      const auction = mockState.auctions.find(
        a => a.chainId === chainId && a.address === auctionAddress.toLowerCase()
      );
      return Promise.resolve(auction ? auction.id : null);
    }),
    getAuctionWithCurrency: vi.fn().mockImplementation((chainId: number, auctionAddress: string) => {
      const auction = mockState.auctions.find(
        a => a.chainId === chainId && a.address === auctionAddress.toLowerCase()
      );
      return Promise.resolve(auction ? {
        id: auction.id,
        currency: auction.currency ?? null,
        isCurrencyStablecoin: auction.isCurrencyStablecoin ?? null,
        tokenInfo: auction.tokenInfo ?? { decimals: 18 },
      } : null);
    }),
    getAuctionWithToken: vi.fn().mockImplementation((chainId: number, auctionAddress: string) => {
      const auction = mockState.auctions.find(
        a => a.chainId === chainId && a.address === auctionAddress.toLowerCase()
      );
      const tokenInfo = auction?.tokenInfo ?? { decimals: 18 };
      return Promise.resolve(auction ? { id: auction.id, tokenInfo } : null);
    }),
    getLatestEthPrice: vi.fn().mockResolvedValue(null),
  };
});

// Mock auction fetcher
vi.mock('@/lib/auction', () => ({
  fetchAuctionOnChainInfo: vi.fn().mockResolvedValue({
    tokenAddress: '0xtoken',
    currencyAddress: '0xcurrency',
    startBlock: 100n,
    endBlock: 200n,
    claimBlock: 250n,
    floorPrice: 1000000n,
    requiredCurrencyRaised: 0n,
    fundsRecipient: '0xfunds',
    tokensRecipient: '0xtokens',
    clearingPrice: 500000n,
    totalTokensForSale: 1000000n,
    totalCurrencyRaised: 0n,
    tokenName: 'Test Token',
    tokenSymbol: 'TEST',
    tokenDecimals: 18,
    tokenTotalSupply: 1000000000000000000000000n,
    startTime: new Date('2025-01-01'),
    endTime: new Date('2025-01-02'),
    currentBlock: 150n,
    status: 'active',
  }),
  isChainSupported: vi.fn().mockReturnValue(true),
}));

import {
  handleAuctionCreated,
  handleTokensReceived,
  handleBidSubmitted,
  processEvent,
  EVENT_NAMES,
} from './handlers';

describe('Event Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockData();
  });

  const baseContext = {
    chainId: 84532,
    blockNumber: 12345,
    transactionHash: '0xtxhash',
    contractAddress: '0xauctionaddress',
    params: {},
    timestamp: new Date('2025-01-01T00:00:00Z'),
    processedLogId: 1,
  };

  describe('handleAuctionCreated', () => {
    it('should create new auction with created status', async () => {
      const ctx = {
        ...baseContext,
        params: {
          auction: '0xNewAuction',
          token: '0xTokenAddress',
        },
      };

      await handleAuctionCreated(ctx);

      expect(mockState.auctions.length).toBe(1);
      expect(mockState.auctions[0].address).toBe('0xnewauction');
      expect(mockState.auctions[0].status).toBe('created');
    });

    it('should skip if auction already exists (idempotent)', async () => {
      // Pre-create auction
      mockState.auctions.push({
        id: 1,
        chainId: 84532,
        address: '0xexistingauction',
        status: 'active',
      });

      const ctx = {
        ...baseContext,
        params: {
          auction: '0xExistingAuction',
          token: '0xTokenAddress',
        },
      };

      await handleAuctionCreated(ctx);

      // Should not create another auction
      expect(mockState.auctions.length).toBe(1);
    });

    it('should throw error for missing auction address', async () => {
      const ctx = {
        ...baseContext,
        params: {},
      };

      // Should throw error for missing required param
      await expect(handleAuctionCreated(ctx)).rejects.toThrow('AuctionCreated: missing required params');
      expect(mockState.auctions.length).toBe(0);
    });
  });

  describe('handleTokensReceived', () => {
    it('should update auction status to planned', async () => {
      // Pre-create auction
      mockState.auctions.push({
        id: 1,
        chainId: 84532,
        address: '0xauctionaddress',
        status: 'created',
      });

      const ctx = {
        ...baseContext,
        params: { amount: '1000000' },
      };

      await handleTokensReceived(ctx);

      expect(mockState.auctions[0].status).toBe('planned');
    });
  });

  describe('handleBidSubmitted', () => {
    // USDC address on Base Sepolia for 6 decimals
    const USDC_ADDRESS = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';

    it('should create new bid record', async () => {
      // Pre-create auction with USDC currency
      mockState.auctions.push({
        id: 1,
        chainId: 84532,
        address: '0xauctionaddress',
        status: 'active',
        currency: USDC_ADDRESS,
        tokenInfo: { decimals: 18 },
      });

      const ctx = {
        ...baseContext,
        params: {
          id: '123',
          owner: '0xBidderAddress',
          price: '500000',
          amount: '100',
        },
      };

      await handleBidSubmitted(ctx);

      expect(mockState.bids.length).toBe(1);
      expect(mockState.bids[0].bidId).toBe('123');
      expect(mockState.bids[0].address).toBe('0xbidderaddress');
      expect(mockState.bids[0].status).toBe('open');
    });

    it('should skip duplicate bid (idempotent)', async () => {
      mockState.auctions.push({
        id: 1,
        chainId: 84532,
        address: '0xauctionaddress',
        status: 'active',
        currency: USDC_ADDRESS,
        tokenInfo: { decimals: 18 },
      });
      mockState.bids.push({
        auctionId: 1,
        bidId: '123',
        address: '0xbidder',
      });

      const ctx = {
        ...baseContext,
        params: {
          id: '123',
          owner: '0xBidderAddress',
          price: '500000',
          amount: '100',
        },
      };

      await handleBidSubmitted(ctx);

      // Should not create another bid
      expect(mockState.bids.length).toBe(1);
    });

    it('should handle positional param format (indexed in topics)', async () => {
      mockState.auctions.push({
        id: 1,
        chainId: 84532,
        address: '0xauctionaddress',
        status: 'active',
        currency: USDC_ADDRESS,
        tokenInfo: { decimals: 18 },
      });

      const ctx = {
        ...baseContext,
        params: {
          0: '456',
          1: '0xBidder2',
          price: '600000',
          amount: '200',
        },
      };

      await handleBidSubmitted(ctx);

      expect(mockState.bids.length).toBe(1);
      expect(mockState.bids[0].bidId).toBe('456');
    });

    it('should convert amount from raw currency units to decimal', async () => {
      mockState.auctions.push({
        id: 1,
        chainId: 84532,
        address: '0xauctionaddress',
        status: 'active',
        currency: USDC_ADDRESS,  // USDC = 6 decimals
        tokenInfo: { decimals: 18 },
      });

      // Test cases from verified on-chain data:
      // raw_amount 3740779 → stored as "3.740779" (USDC with 6 decimals)
      // raw_amount 256607984 → stored as "256.607984"
      const testCases = [
        { rawAmount: '3740779', expectedStored: '3.740779' },
        { rawAmount: '41900000', expectedStored: '41.9' },
        { rawAmount: '256607984', expectedStored: '256.607984' },
        { rawAmount: '1055996', expectedStored: '1.055996' },
      ];

      for (let i = 0; i < testCases.length; i++) {
        const { rawAmount, expectedStored } = testCases[i];
        const ctx = {
          ...baseContext,
          params: {
            id: String(i),
            owner: '0xBidder',
            price: '8002044413940664',
            amount: rawAmount,
          },
        };

        await handleBidSubmitted(ctx);

        expect(mockState.bids[i].amount).toBe(expectedStored);
      }
    });

    it('should convert Q96 price to display decimal via q96ToPrice', async () => {
      mockState.auctions.push({
        id: 1,
        chainId: 84532,
        address: '0xauctionaddress',
        status: 'active',
        currency: USDC_ADDRESS,
        tokenInfo: { decimals: 18 },
      });

      // Test cases from verified on-chain data:
      // raw_price 8002044413940664 -> 0.101 (already adjusted for 18-6 decimals)
      const testCases = [
        { rawPrice: '8002044413940664', expectedDisplay: 0.101 },
        { rawPrice: '8081272576454928', expectedDisplay: 0.102 },
        { rawPrice: '11884224377139600', expectedDisplay: 0.15 },
      ];

      for (let i = 0; i < testCases.length; i++) {
        const { rawPrice, expectedDisplay } = testCases[i];
        const ctx = {
          ...baseContext,
          params: {
            id: String(i),
            owner: '0xBidder',
            price: rawPrice,
            amount: '1000000',
          },
        };

        await handleBidSubmitted(ctx);

        const storedPrice = parseFloat(mockState.bids[i].maxPrice);

        // Stored value is already final user-facing price
        expect(storedPrice).toBeCloseTo(expectedDisplay, 2);
      }
    });

    it('should correctly convert specific verified bid data', async () => {
      mockState.auctions.push({
        id: 1,
        chainId: 84532,
        address: '0xauctionaddress',
        status: 'active',
        currency: USDC_ADDRESS,
        tokenInfo: { decimals: 18 },
      });

      // Verified data from on-chain event:
      // raw_bid: 256607984 → 256.607984 USDC (stored as decimal)
      // raw_price: 8002044413940664 → 0.101 (after decimal adjustment)
      const ctx = {
        ...baseContext,
        params: {
          id: '1343',
          owner: '0x7b5d2fF5dBFd12a11b5d8e6F2E42a5a151efbA60',
          price: '8002044413940664',
          amount: '256607984',
        },
      };

      await handleBidSubmitted(ctx);

      // Amount stored as decimal (256607984 / 10^6 = 256.607984)
      expect(mockState.bids[0].amount).toBe('256.607984');

      // Verify it's correct as a number
      const storedAmount = parseFloat(mockState.bids[0].amount);
      expect(storedAmount).toBeCloseTo(256.6, 1);

      // Price stored in final display units
      const storedPrice = parseFloat(mockState.bids[0].maxPrice);
      expect(storedPrice).toBeCloseTo(0.101, 2);
    });
  });

  describe('processEvent', () => {
    it('should dispatch to correct handler based on event name', async () => {
      const ctx = {
        ...baseContext,
        params: {
          auction: '0xNewAuction',
          token: '0xToken',
        },
      };

      await processEvent(EVENT_NAMES.AUCTION_CREATED, ctx);

      expect(mockState.auctions.length).toBe(1);
    });

    it('should handle unknown events gracefully', async () => {
      const ctx = {
        ...baseContext,
        params: {},
      };

      // Should not throw
      await processEvent('UnknownEvent', ctx);
    });
  });
});

describe('Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockData();
  });

  it('should not create duplicate auctions on replay', async () => {
    const ctx = {
      chainId: 84532,
      blockNumber: 12345,
      transactionHash: '0xtxhash',
      contractAddress: '0xcontract',
      params: {
        auction: '0xAuction1',
        token: '0xToken1',
      },
      timestamp: new Date(),
      processedLogId: 1,
    };

    // First call creates auction
    await handleAuctionCreated(ctx);
    expect(mockState.auctions.length).toBe(1);

    // Second call should be idempotent
    await handleAuctionCreated(ctx);
    expect(mockState.auctions.length).toBe(1);
  });

  it('should not create duplicate bids on replay', async () => {
    // USDC address on Base Sepolia
    const USDC_ADDRESS = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';

    mockState.auctions.push({
      id: 1,
      chainId: 84532,
      address: '0xauctionaddress',
      status: 'active',
      currency: USDC_ADDRESS,
      tokenInfo: { decimals: 18 },
    });

    const ctx = {
      chainId: 84532,
      blockNumber: 12345,
      transactionHash: '0xtxhash',
      contractAddress: '0xauctionaddress',
      params: {
        id: '1',
        owner: '0xBidder',
        price: '100',
        amount: '50',
      },
      timestamp: new Date(),
      processedLogId: 1,
    };

    // First call creates bid
    await handleBidSubmitted(ctx);
    expect(mockState.bids.length).toBe(1);

    // Second call should be idempotent
    await handleBidSubmitted(ctx);
    expect(mockState.bids.length).toBe(1);
  });
});
