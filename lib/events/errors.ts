/**
 * Structured error types for event handlers.
 * Allows programmatic error handling and categorization.
 */

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Error types for event processing.
 * These are stored in the database for analysis and programmatic retry logic.
 */
export const EventErrorType = {
  // Auction-related errors
  AUCTION_NOT_FOUND: 'AUCTION_NOT_FOUND',
  AUCTION_MISSING_PARAMS: 'AUCTION_MISSING_PARAMS',

  // Bid-related errors
  BID_NOT_FOUND: 'BID_NOT_FOUND',
  BID_MISSING_PARAMS: 'BID_MISSING_PARAMS',

  // General errors
  MISSING_PARAMS: 'MISSING_PARAMS',
  DECODE_ERROR: 'DECODE_ERROR',
  DB_ERROR: 'DB_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type EventErrorType = typeof EventErrorType[keyof typeof EventErrorType];

// =============================================================================
// CUSTOM ERROR CLASS
// =============================================================================

/**
 * Custom error class for event processing errors.
 * Includes error type for categorization and context data for debugging.
 */
export class EventProcessingError extends Error {
  readonly type: EventErrorType;
  readonly context: Record<string, unknown>;

  constructor(
    type: EventErrorType,
    message: string,
    context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'EventProcessingError';
    this.type = type;
    this.context = context;

    // Maintains proper stack trace for where the error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EventProcessingError);
    }
  }

  /**
   * Create a string representation including type and context.
   */
  toString(): string {
    return `[${this.type}] ${this.message}`;
  }
}

// =============================================================================
// ERROR FACTORIES
// =============================================================================

/**
 * Create an "auction not found" error.
 */
export function auctionNotFoundError(
  eventName: string,
  chainId: number,
  auctionAddress: string
): EventProcessingError {
  return new EventProcessingError(
    EventErrorType.AUCTION_NOT_FOUND,
    `${eventName}: auction not found (chain=${chainId}, address=${auctionAddress})`,
    { eventName, chainId, auctionAddress }
  );
}

/**
 * Create a "bid not found" error.
 */
export function bidNotFoundError(
  eventName: string,
  auctionId: number,
  bidId: string | number
): EventProcessingError {
  return new EventProcessingError(
    EventErrorType.BID_NOT_FOUND,
    `${eventName}: bid not found (auctionId=${auctionId}, bidId=${bidId})`,
    { eventName, auctionId, bidId }
  );
}

/**
 * Create a "missing params" error.
 */
export function missingParamsError(
  eventName: string,
  params: unknown
): EventProcessingError {
  return new EventProcessingError(
    EventErrorType.MISSING_PARAMS,
    `${eventName}: missing required params: ${JSON.stringify(params)}`,
    { eventName, params }
  );
}

// =============================================================================
// ERROR TYPE EXTRACTION
// =============================================================================

/**
 * Extract error type from an error object.
 * Works with both EventProcessingError and regular Error objects.
 */
export function getErrorType(error: unknown): EventErrorType {
  // If it's our custom error, return its type directly
  if (error instanceof EventProcessingError) {
    return error.type;
  }

  // For regular errors, try to infer type from message
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('auction not found')) {
      return EventErrorType.AUCTION_NOT_FOUND;
    }
    if (message.includes('bid not found')) {
      return EventErrorType.BID_NOT_FOUND;
    }
    if (message.includes('missing') && message.includes('param')) {
      return EventErrorType.MISSING_PARAMS;
    }
    if (message.includes('decode')) {
      return EventErrorType.DECODE_ERROR;
    }
  }

  return EventErrorType.UNKNOWN_ERROR;
}

/**
 * Check if an error is of a specific type.
 */
export function isErrorType(error: unknown, type: EventErrorType): boolean {
  return getErrorType(error) === type;
}
