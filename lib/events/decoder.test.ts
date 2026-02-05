import { describe, it, expect } from 'vitest';
import { decodeEventData, findEventTopic } from './decoder';
import type { EventTopic } from '../db/schema';

// Mock event topics based on migration seed data
const mockEventTopics: EventTopic[] = [
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
    params: 'uint256 indexed id, address indexed owner, uint256 price, uint128 amount',
    signature: 'BidSubmitted(uint256 indexed id, address indexed owner, uint256 price, uint128 amount)',
    alchemySignatures: {},
  },
  {
    id: 3,
    eventName: 'TokensReceived',
    topic0: '0x17cca138a663106b4c25a247e2d9238888fe37188d83b7bb7287bc1c0a4df82a',
    params: 'uint256',
    signature: 'TokensReceived(uint256 amount)',
    alchemySignatures: {},
  },
  {
    id: 4,
    eventName: 'ClearingPriceUpdated',
    topic0: '0x30adbe996d7a69a21fdebcc1f8a46270bf6c22d505a7d872c1ab4767aa707609',
    params: 'uint256 blockNumber, uint256 clearingPrice',
    signature: 'ClearingPriceUpdated(uint256 blockNumber, uint256 clearingPrice)',
    alchemySignatures: {},
  },
];

describe('findEventTopic', () => {
  it('should find event topic by topic0', () => {
    const result = findEventTopic(
      mockEventTopics,
      '0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9'
    );
    expect(result).toBeDefined();
    expect(result?.eventName).toBe('AuctionCreated');
    expect(result?.id).toBe(1);
  });

  it('should find event topic case-insensitively', () => {
    const result = findEventTopic(
      mockEventTopics,
      '0x7EDE475FAD18CCF0039F2B956C4D43A8B4ED0853DE4DAAA8AE25299F331AE3B9'
    );
    expect(result).toBeDefined();
    expect(result?.eventName).toBe('AuctionCreated');
  });

  it('should return undefined for unknown topic', () => {
    const result = findEventTopic(
      mockEventTopics,
      '0x0000000000000000000000000000000000000000000000000000000000000000'
    );
    expect(result).toBeUndefined();
  });
});

describe('decodeEventData', () => {
  it('should decode event with indexed address parameters', () => {
    // AuctionCreated event with indexed auction and token addresses
    const eventTopic = mockEventTopics[0];
    const topics = [
      '0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9', // topic0
      '0x000000000000000000000000aabbccdd11223344556677889900aabbccdd1122', // auction address (indexed)
      '0x0000000000000000000000001234567890123456789012345678901234567890', // token address (indexed)
    ];
    // Non-indexed: uint256 amount, bytes configData
    const data = '0x0000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000461626364000000000000000000000000000000000000000000000000000000';

    const result = decodeEventData(eventTopic, topics, data);

    expect(result.eventName).toBe('AuctionCreated');
    expect(result.eventTopicId).toBe(1);
    // viem returns checksummed addresses
    expect((result.params.auction as string).toLowerCase()).toBe('0xaabbccdd11223344556677889900aabbccdd1122');
    expect((result.params.token as string).toLowerCase()).toBe('0x1234567890123456789012345678901234567890');
    expect(result.params.amount).toBe('1000000000000000000'); // 1 ether as string
  });

  it('should decode event with non-indexed parameters only', () => {
    // ClearingPriceUpdated event with only non-indexed params
    const eventTopic = mockEventTopics[3];
    const topics = [
      '0x30adbe996d7a69a21fdebcc1f8a46270bf6c22d505a7d872c1ab4767aa707609',
    ];
    // Two uint256 values: blockNumber=12345, clearingPrice=100
    const data = '0x00000000000000000000000000000000000000000000000000000000000030390000000000000000000000000000000000000000000000000000000000000064';

    const result = decodeEventData(eventTopic, topics, data);

    expect(result.eventName).toBe('ClearingPriceUpdated');
    expect(result.eventTopicId).toBe(4);
    expect(result.params.blockNumber).toBe('12345');
    expect(result.params.clearingPrice).toBe('100');
  });

  it('should decode TokensReceived event with single uint256 param', () => {
    const eventTopic = mockEventTopics[2];
    const topics = [
      '0x17cca138a663106b4c25a247e2d9238888fe37188d83b7bb7287bc1c0a4df82a',
    ];
    // uint256 amount = 5000
    const data = '0x0000000000000000000000000000000000000000000000000000000000001388';

    const result = decodeEventData(eventTopic, topics, data);

    expect(result.eventName).toBe('TokensReceived');
    expect(result.eventTopicId).toBe(3);
    expect(result.params.amount).toBe('5000');
  });

  it('should handle empty data gracefully', () => {
    // Event with no non-indexed params
    const eventTopic: EventTopic = {
      id: 99,
      eventName: 'SimpleEvent',
      topic0: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      params: null,
      signature: 'SimpleEvent()',
      alchemySignatures: {},
    };
    const topics = ['0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'];
    const data = '0x';

    const result = decodeEventData(eventTopic, topics, data);

    expect(result.eventName).toBe('SimpleEvent');
    expect(result.eventTopicId).toBe(99);
  });

  it('should handle event topic with null signature', () => {
    const eventTopic: EventTopic = {
      id: 99,
      eventName: 'UnknownEvent',
      topic0: '0xabcdef',
      params: null,
      signature: null,
      alchemySignatures: {},
    };
    const topics = ['0xabcdef'];
    const data = '0x1234';

    const result = decodeEventData(eventTopic, topics, data);

    expect(result.eventName).toBe('UnknownEvent');
    expect(result.eventTopicId).toBe(99);
    expect(Object.keys(result.params).length).toBe(0);
  });

  it('should handle invalid signature gracefully', () => {
    const eventTopic: EventTopic = {
      id: 99,
      eventName: 'BadEvent',
      topic0: '0xabcdef',
      params: null,
      signature: 'not a valid signature',
      alchemySignatures: {},
    };
    const topics = ['0xabcdef'];
    const data = '0x1234';

    const result = decodeEventData(eventTopic, topics, data);

    expect(result.eventName).toBe('BadEvent');
    expect(result.eventTopicId).toBe(99);
    // Should contain raw data since decoding failed
    expect(result.params._rawData).toBe('0x1234');
  });
});

describe('BidSubmitted event decoding', () => {
  it('should decode BidSubmitted with named parameters', () => {
    const eventTopic = mockEventTopics[1];
    // topic0 + indexed id (1) + indexed owner; data = price (100) + amount (50)
    const topics = [
      '0x650baad5cd8ca09b8f580be220fa04ce2ba905a041f764b6a3fe2c848eb70540',
      '0x0000000000000000000000000000000000000000000000000000000000000001', // id
      '0x000000000000000000000000000000000000000000000000abcdef1234567890', // owner (padded)
    ];
    const data =
      '0x00000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000032'; // price, amount

    const result = decodeEventData(eventTopic, topics, data);

    expect(result.eventName).toBe('BidSubmitted');
    expect(result.params.id).toBe('1');
    expect((result.params.owner as string).toLowerCase()).toContain('abcdef12');
    expect(result.params.price).toBe('100');
    expect(result.params.amount).toBe('50');
  });
});
