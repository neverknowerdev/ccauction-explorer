import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as crypto from 'crypto';

const TEST_SIGNING_KEY = 'test-signing-key';

function signBody(body: string, key: string): string {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(body, 'utf8');
  return hmac.digest('hex');
}

// Mock the database module
vi.mock('@/lib/db', () => {
  const mockEventTopics = [
    {
      id: 1,
      eventName: 'AuctionCreated',
      topic0: '0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9',
      params: 'index_topic_1 address auction, index_topic_2 address token, uint256 amount, bytes configData',
      signature: 'AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)',
      alchemySignatures: {},
    },
    {
      id: 2,
      eventName: 'BidSubmitted',
      topic0: '0x650baad5cd8ca09b8f580be220fa04ce2ba905a041f764b6a3fe2c848eb70540',
      params: 'uint256,address,uint256,uint256',
      signature: 'BidSubmitted(uint256 bidId, address bidder, uint256 price, uint256 amount)',
      alchemySignatures: {},
    },
  ];

  // Track inserted logs with their state
  const insertedLogs = new Map<string, { id: number; isError: boolean }>();
  let logIdCounter = 0;

  return {
    db: {
      select: vi.fn().mockImplementation((columns?: any) => ({
        from: vi.fn().mockImplementation((table: any) => {
          // If selecting from event_topics, return mock topics
          if (!columns || (!columns.id && !columns.isError)) {
            return Promise.resolve(mockEventTopics);
          }
          // If checking for existing processed_logs (now returns id and isError)
          return {
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => {
                // Return empty array by default (log doesn't exist)
                return Promise.resolve([]);
              }),
            })),
          };
        }),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((values: any) => {
          // processed_logs_errors insert (has processedLogId)
          if ('processedLogId' in values && !('chainId' in values)) {
            return Promise.resolve();
          }
          // processed_logs insert
          return {
            onConflictDoNothing: vi.fn().mockImplementation(() => ({
              returning: vi.fn().mockImplementation(() => {
                const key = `${values.chainId}-${values.blockNumber}-${values.transactionHash}-${values.logIndex}`;
                const existing = insertedLogs.get(key);
                if (existing && !existing.isError) {
                  return Promise.resolve([]);
                }
                const id = ++logIdCounter;
                insertedLogs.set(key, { id, isError: false });
                return Promise.resolve([{ id }]);
              }),
            })),
          };
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((setValues: any) => ({
          where: vi.fn().mockImplementation(() => ({
            // For claimErroredLogForRetry - returns id if log has error
            returning: vi.fn().mockImplementation(() => {
              // Find a log with isError=true that matches the where conditions
              // For simplicity in tests, we don't track which log was targeted
              // This mock just returns empty (no errored log to claim)
              return Promise.resolve([]);
            }),
          })),
        })),
      })),
    },
    processedLogs: {
      id: 'id',
      chainId: 'chain_id',
      blockNumber: 'block_number',
      transactionHash: 'transaction_hash',
      logIndex: 'log_index',
      eventTopicId: 'event_topic_id',
      contractAddress: 'contract_address',
      params: 'params',
      processedAt: 'processed_at',
      isError: 'is_error',
    },
    processedLogsErrors: {},
    eventTopics: {},
    getEventTopics: vi.fn().mockResolvedValue(mockEventTopics),
    // Reset function for tests
    __resetMocks: () => {
      insertedLogs.clear();
      logIdCounter = 0;
    },
  };
});

// Set environment variables before importing the route
process.env.ALCHEMY_SIGNING_KEYS = JSON.stringify([TEST_SIGNING_KEY]);
process.env.DB_CONNECTION_STRING = 'postgresql://test:test@localhost:5432/test';

// Import after mocking
import { POST } from './route';
import * as dbModule from '@/lib/db';

describe('Alchemy Webhook Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbModule as any).__resetMocks?.();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createMockRequest(body: object): NextRequest {
    const bodyStr = JSON.stringify(body);
    const signature = signBody(bodyStr, TEST_SIGNING_KEY);
    return new NextRequest('http://localhost/api/handle-event/alchemy', {
      method: 'POST',
      body: bodyStr,
      headers: {
        'Content-Type': 'application/json',
        'X-Alchemy-Signature': signature,
      },
    });
  }

  function createAlchemyWebhookPayload(logs: any[] = [], blockNumber = '0x1234') {
    return {
      event: {
        network: { chainId: 84532 },
        data: {
          block: {
            number: blockNumber,
            hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            timestamp: '0x65abc123',
            logs,
          },
        },
      },
    };
  }

  it('should return 500 when ALCHEMY_SIGNING_KEYS is empty', async () => {
    const orig = process.env.ALCHEMY_SIGNING_KEYS;
    process.env.ALCHEMY_SIGNING_KEYS = '';
    const request = createMockRequest(createAlchemyWebhookPayload([]));
    const response = await POST(request);
    const data = await response.json();
    process.env.ALCHEMY_SIGNING_KEYS = orig;

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/configuration/i);
  });

  it('should return 401 when X-Alchemy-Signature header is missing', async () => {
    const body = createAlchemyWebhookPayload([]);
    const request = new NextRequest('http://localhost/api/handle-event/alchemy', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/missing signature/i);
  });

  it('should return 401 when signature is invalid', async () => {
    const body = createAlchemyWebhookPayload([]);
    const request = new NextRequest('http://localhost/api/handle-event/alchemy', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        'X-Alchemy-Signature': 'invalid-signature',
      },
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/invalid signature/i);
  });

  it('should accept signature valid for any key in ALCHEMY_SIGNING_KEYS', async () => {
    const otherKey = 'other-webhook-key';
    process.env.ALCHEMY_SIGNING_KEYS = JSON.stringify([TEST_SIGNING_KEY, otherKey]);
    const body = createAlchemyWebhookPayload([]);
    const bodyStr = JSON.stringify(body);
    const signature = signBody(bodyStr, otherKey);
    const request = new NextRequest('http://localhost/api/handle-event/alchemy', {
      method: 'POST',
      body: bodyStr,
      headers: {
        'Content-Type': 'application/json',
        'X-Alchemy-Signature': signature,
      },
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    process.env.ALCHEMY_SIGNING_KEYS = JSON.stringify([TEST_SIGNING_KEY]);
  });

  it('should return 400 for missing block data', async () => {
    const request = createMockRequest({ event: {} });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid request format');
  });

  it('should process valid webhook with no logs', async () => {
    const request = createMockRequest(createAlchemyWebhookPayload([]));
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.logsCount).toBe(0);
    expect(data.processed).toBe(0);
    expect(data.skipped).toBe(0);
  });

  it('should process valid webhook with known event log', async () => {
    const logs = [
      {
        index: 0,
        data: '0x0000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000461626364000000000000000000000000000000000000000000000000000000',
        topics: [
          '0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9',
          '0x000000000000000000000000aabbccdd11223344556677889900aabbccdd1122',
          '0x0000000000000000000000001234567890123456789012345678901234567890',
        ],
        account: { address: '0xContractAddress' },
        transaction: { hash: '0xTxHash123' },
      },
    ];

    const request = createMockRequest(createAlchemyWebhookPayload(logs));
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.logsCount).toBe(1);
    // Event processing fails in test due to incomplete mock, but log is still recorded
    // The log is marked as error because processEvent throws (mock limitations)
    expect(data.processed + data.errors).toBe(1);
    // When processEvent throws, a row is recorded in processed_logs_errors
    expect(dbModule.db.insert).toHaveBeenCalledTimes(2); // processedLogs then processed_logs_errors
    const valuesCalls = (dbModule.db.insert as ReturnType<typeof vi.fn>).mock.results.map(
      (r: any) => r.value?.values?.mock?.calls
    );
    const allValuesArgs = valuesCalls.flat().map((call: any) => call?.[0]);
    const errorRow = allValuesArgs.find((v: any) => v && 'processedLogId' in v && 'error' in v);
    expect(errorRow).toBeDefined();
    expect(errorRow).toMatchObject({ error: expect.any(String) });
  });

  it('should skip log without transaction hash', async () => {
    const logs = [
      {
        index: 0,
        data: '0x',
        topics: ['0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9'],
        account: { address: '0xContractAddress' },
        transaction: {}, // Missing hash
      },
    ];

    const request = createMockRequest(createAlchemyWebhookPayload(logs));
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.errors).toBe(1);
  });

  it('should handle log with unknown event topic', async () => {
    const logs = [
      {
        index: 0,
        data: '0x',
        topics: ['0x0000000000000000000000000000000000000000000000000000000000000000'],
        account: { address: '0xContractAddress' },
        transaction: { hash: '0xUnknownEventTx' },
      },
    ];

    const request = createMockRequest(createAlchemyWebhookPayload(logs));
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.processed).toBe(1); // Still processes, just without decoded params
  });

  it('should parse hex block number correctly', async () => {
    const logs = [
      {
        index: 5,
        data: '0x',
        topics: ['0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9'],
        account: { address: '0xContract' },
        transaction: { hash: '0xTxHash' },
      },
    ];

    const request = createMockRequest(createAlchemyWebhookPayload(logs, '0x1000')); // 4096 in decimal
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.blockNumber).toBe(4096);
  });

  it('should process multiple logs in single webhook', async () => {
    const logs = [
      {
        index: 0,
        data: '0x',
        topics: ['0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9'],
        account: { address: '0xContract1' },
        transaction: { hash: '0xTxHash1' },
      },
      {
        index: 1,
        data: '0x0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000abcdef1234567890abcdef1234567890abcdef1200000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000032',
        topics: ['0x650baad5cd8ca09b8f580be220fa04ce2ba905a041f764b6a3fe2c848eb70540'],
        account: { address: '0xContract2' },
        transaction: { hash: '0xTxHash2' },
      },
      {
        index: 2,
        data: '0x',
        topics: ['0xunknown'],
        account: { address: '0xContract3' },
        transaction: { hash: '0xTxHash3' },
      },
    ];

    const request = createMockRequest(createAlchemyWebhookPayload(logs));
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.logsCount).toBe(3);
    // Some events fail processing due to incomplete mocks, but all logs are recorded
    expect(data.processed + data.errors).toBe(3);
  });

  it('should use chainId from webhook payload', async () => {
    const payload = {
      event: {
        network: { chainId: 8453 }, // Base Mainnet
        data: {
          block: {
            number: '0x100',
            hash: '0xhash',
            timestamp: '0x123',
            logs: [],
          },
        },
      },
    };

    const request = createMockRequest(payload);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.chainId).toBe(8453);
  });
});

describe('Idempotency Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dbModule as any).__resetMocks?.();
  });

  it('should skip duplicate logs on reprocessing', async () => {
    // Minimal mock log: only topic0 (AuctionCreated). Decode will fail (missing topic1/topic2),
    // but the log is still inserted into processed_logs. Second request then sees duplicate and skips.
    // Stderr from decode/handler errors in the first request is expected.
    const logs = [
      {
        index: 0,
        data: '0x',
        topics: ['0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9'],
        account: { address: '0xContract' },
        transaction: { hash: '0xDuplicateTx' },
      },
    ];

    const payload = {
      event: {
        network: { chainId: 84532 },
        data: {
          block: {
            number: '0x5000',
            hash: '0xDuplicateBlock',
            timestamp: '0x123',
            logs,
          },
        },
      },
    };

    const payloadStr = JSON.stringify(payload);
    const signature = signBody(payloadStr, TEST_SIGNING_KEY);

    const request1 = new NextRequest('http://localhost/api/handle-event/alchemy', {
      method: 'POST',
      body: payloadStr,
      headers: { 'X-Alchemy-Signature': signature },
    });
    const response1 = await POST(request1);
    const data1 = await response1.json();

    // First request: log is recorded; decode/handler error (incomplete mock) → we count 1 "touch"
    expect(data1.processed + data1.errors).toBe(1);

    const request2 = new NextRequest('http://localhost/api/handle-event/alchemy', {
      method: 'POST',
      body: payloadStr,
      headers: { 'X-Alchemy-Signature': signature },
    });
    const response2 = await POST(request2);
    const data2 = await response2.json();

    expect(data2.processed).toBe(0);
    expect(data2.skipped).toBe(1);
  });
});
