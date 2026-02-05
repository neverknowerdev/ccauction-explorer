import { decodeEventLog, parseAbiItem } from 'viem';
import type { Abi, AbiEvent } from 'viem';
import type { EventTopic } from '../db/schema';

export interface DecodedEvent {
  eventName: string;
  eventTopicId: number;
  params: Record<string, unknown>;
}

/**
 * Convert event signature to viem ABI event
 * Example: "AuctionCreated(address,address,uint256,bytes)" -> AbiEvent
 */
function signatureToAbiEvent(signature: string): AbiEvent | null {
  try {
    const abiItem = parseAbiItem(`event ${signature}`);
    if (abiItem.type === 'event') {
      return abiItem;
    }
    return null;
  } catch (error) {
    console.warn(`Failed to parse event signature: ${signature}`, error);
    return null;
  }
}

/**
 * Convert BigInt values to strings recursively for JSON serialization
 */
function serializeParams(obj: unknown): unknown {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeParams);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeParams(value);
    }
    return result;
  }
  return obj;
}

/**
 * Decode event data using viem's decodeEventLog
 */
export function decodeEventData(
  eventTopic: EventTopic,
  topics: string[],
  data: string
): DecodedEvent {
  // If no signature available, return empty params
  if (!eventTopic.signature) {
    return {
      eventName: eventTopic.eventName,
      eventTopicId: eventTopic.id,
      params: {},
    };
  }

  const abiEvent = signatureToAbiEvent(eventTopic.signature);
  if (!abiEvent) {
    return {
      eventName: eventTopic.eventName,
      eventTopicId: eventTopic.id,
      params: { _rawData: data, _rawTopics: topics },
    };
  }

  try {
    const decoded = decodeEventLog({
      abi: [abiEvent] as Abi,
      data: data as `0x${string}`,
      topics: topics as [`0x${string}`, ...`0x${string}`[]],
    });

    // Serialize BigInt values to strings for JSON compatibility
    const serializedArgs = serializeParams(decoded.args) as Record<string, unknown>;

    return {
      eventName: eventTopic.eventName,
      eventTopicId: eventTopic.id,
      params: serializedArgs,
    };
  } catch (error) {
    // Fallback: try indexed signature for events where contract uses indexed params
    const fallbackSignature = getIndexedFallbackSignature(eventTopic.eventName);
    if (fallbackSignature) {
      try {
        const fallbackAbi = signatureToAbiEvent(fallbackSignature);
        if (fallbackAbi) {
          const decoded = decodeEventLog({
            abi: [fallbackAbi] as Abi,
            data: data as `0x${string}`,
            topics: topics as [`0x${string}`, ...`0x${string}`[]],
          });
          const serializedArgs = serializeParams(decoded.args) as Record<string, unknown>;
          return {
            eventName: eventTopic.eventName,
            eventTopicId: eventTopic.id,
            params: serializedArgs,
          };
        }
      } catch {
        // fall through to return raw params
      }
    }

    console.warn(`Failed to decode event ${eventTopic.eventName}:`, error);
    return {
      eventName: eventTopic.eventName,
      eventTopicId: eventTopic.id,
      params: { _rawData: data, _rawTopics: topics, _error: String(error) },
    };
  }
}

/**
 * Some contracts emit with indexed params (in topics) while DB stores non-indexed signature.
 * Return alternative signature to try on decode failure.
 */
function getIndexedFallbackSignature(eventName: string): string | null {
  const fallbacks: Record<string, string> = {
    AuctionCreated: 'AuctionCreated(address indexed auction, address indexed token, uint256 amount, bytes configData)',
    BidSubmitted: 'BidSubmitted(uint256 indexed id, address indexed owner, uint256 price, uint128 amount)',
    BidExited: 'BidExited(uint256 indexed bidId, address indexed owner, uint256 tokensFilled, uint256 currencyRefunded)',
    TokensClaimed: 'TokensClaimed(uint256 indexed bidId, address indexed owner, uint256 tokensFilled)',
  };
  return fallbacks[eventName] ?? null;
}

/**
 * Find matching event topic by topic0
 */
export function findEventTopic(
  eventTopics: EventTopic[],
  topic0: string
): EventTopic | undefined {
  return eventTopics.find(et => et.topic0.toLowerCase() === topic0.toLowerCase());
}
