import { sql } from 'drizzle-orm';
import {
  pgTable,
  bigserial,
  integer,
  bigint,
  text,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
  uniqueIndex,
  numeric,
  pgEnum,
  primaryKey,
  uuid,
} from 'drizzle-orm/pg-core';

// Enums
export const auctionStatusEnum = pgEnum('auction_status', [
  'created',
  'planned',
  'active',
  'graduated',
  'claimable',
  'ended',
]);

export const extraFundsDestinationEnum = pgEnum('extra_funds_destination', [
  'pool',
  'creator',
]);

export const bidStatusEnum = pgEnum('bid_status', [
  'open',
  'closed',
  'filled',
  'partially_filled',
  'cancelled',
  'claimed',
]);

export const processedLogSourceEnum = pgEnum('processed_log_source', [
  'ALCHEMY_WEBHOOK',
  'scanScript',
]);

/** Event processing error types; must match lib/events/errors.ts EventErrorType */
export const eventErrorTypeEnum = pgEnum('event_error_type', [
  'AUCTION_NOT_FOUND',
  'AUCTION_MISSING_PARAMS',
  'BID_NOT_FOUND',
  'BID_MISSING_PARAMS',
  'MISSING_PARAMS',
  'DECODE_ERROR',
  'DB_ERROR',
  'UNKNOWN_ERROR',
]);

// Chains table
export const chains = pgTable('chains', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  title: text('title').notNull(),
  isTestnet: boolean('is_testnet').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
});

// Event topics table
export const eventTopics = pgTable('event_topics', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  eventName: text('event_name').notNull(),
  topic0: text('topic0').notNull().unique(),
  params: text('params'),
  signature: text('signature'),
  alchemySignatures: jsonb('alchemy_signatures').notNull().default({}),
}, (table) => [
  index('idx_event_topics_topic0').on(table.topic0),
]);

// Processed logs table
export const processedLogs = pgTable('processed_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chainId: integer('chain_id').notNull().references(() => chains.id),
  blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
  transactionHash: text('transaction_hash').notNull(),
  logIndex: integer('log_index').notNull(),
  eventTopicId: bigint('event_topic_id', { mode: 'number' }).references(() => eventTopics.id),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  contractAddress: text('contract_address'),
  params: jsonb('params'),
  isError: boolean('is_error').notNull().default(false),
  source: processedLogSourceEnum('source').notNull().default('ALCHEMY_WEBHOOK'),
}, (table) => [
  unique('processed_logs_chain_block_tx_log_unique').on(
    table.chainId,
    table.blockNumber,
    table.transactionHash,
    table.logIndex
  ),
  index('idx_processed_logs_chain_block').on(table.chainId, table.blockNumber),
]);

// Users table (minimal ref for bids.user_id; full def in migrations/003)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
});

// Auctions table (amount and price fields = human-readable decimals)
export const auctions = pgTable('auctions', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chainId: integer('chain_id').notNull().references(() => chains.id),
  address: text('address').notNull(),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime: timestamp('end_time', { withTimezone: true }),
  status: auctionStatusEnum('status').notNull().default('created'),
  creatorAddress: text('creator_address'),
  safetyCheckups: jsonb('safety_checkups').notNull().default({}),
  token: jsonb('token'),
  currency: text('currency'),
  currencyName: text('currency_name'),
  targetAmount: numeric('target_amount', { precision: 30, scale: 18 }),
  auctionTokenSupply: numeric('auction_token_supply', { precision: 30, scale: 18 }),
  collectedAmount: numeric('collected_amount', { precision: 30, scale: 18 }),
  floorPrice: numeric('floor_price', { precision: 30, scale: 18 }),
  currentClearingPrice: numeric('current_clearing_price', { precision: 30, scale: 18 }),
  extraFundsDestination: extraFundsDestinationEnum('extra_funds_destination'),
  supplyInfo: jsonb('supply_info'),
  processedLogId: bigint('processed_log_id', { mode: 'number' }).references(() => processedLogs.id),
  sourceCodeHash: text('source_code_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('auctions_chain_address_unique').on(table.chainId, table.address),
  uniqueIndex('idx_auctions_address').on(table.address),
  index('idx_auctions_token_address').on(sql`(${table.token}->>'address')`).where(sql`${table.token} IS NOT NULL AND ${table.token}->>'address' IS NOT NULL`),
  index('idx_auctions_processed_log_id').on(table.processedLogId),
]);

// Bids table (composite primary key)
export const bids = pgTable('bids', {
  auctionId: bigint('auction_id', { mode: 'number' }).notNull().references(() => auctions.id, { onDelete: 'cascade' }),
  bidId: numeric('bid_id', { precision: 78, scale: 0 }).notNull(),
  address: text('address').notNull(),
  userId: uuid('user_id').references(() => users.id),
  amount: numeric('amount', { precision: 30, scale: 18 }).notNull(),
  maxPrice: numeric('max_price', { precision: 30, scale: 18 }).notNull(),
  clearingPrice: numeric('clearing_price', { precision: 30, scale: 18 }),
  filledTokens: numeric('filled_tokens', { precision: 30, scale: 18 }),
  status: bidStatusEnum('status').notNull().default('open'),
  time: timestamp('time', { withTimezone: true }).notNull(),
  processedLogId: bigint('processed_log_id', { mode: 'number' }).references(() => processedLogs.id),
}, (table) => [
  primaryKey({ columns: [table.auctionId, table.bidId] }),
  index('idx_bids_address').on(table.address),
  index('idx_bids_auction_id').on(table.auctionId),
  index('idx_bids_user_id').on(table.userId).where(sql`${table.userId} IS NOT NULL`),
]);

// Clearing price history table
export const clearingPriceHistory = pgTable('clearing_price_history', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  auctionId: bigint('auction_id', { mode: 'number' }).notNull().references(() => auctions.id, { onDelete: 'cascade' }),
  time: timestamp('time', { withTimezone: true }).notNull(),
  clearingPrice: numeric('clearing_price', { precision: 30, scale: 18 }).notNull(),
  processedLogId: bigint('processed_log_id', { mode: 'number' }).references(() => processedLogs.id),
}, (table) => [
  index('idx_clearing_price_history_auction_id').on(table.auctionId),
]);

// Processed logs errors table
export const processedLogsErrors = pgTable('processed_logs_errors', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  processedLogId: bigint('processed_log_id', { mode: 'number' }).notNull().references(() => processedLogs.id, { onDelete: 'cascade' }),
  errorType: eventErrorTypeEnum('error_type'),
  error: text('error').notNull(),
  stacktrace: text('stacktrace'),
  time: timestamp('time', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_processed_logs_errors_processed_log_id').on(table.processedLogId),
  index('idx_processed_logs_errors_error_type').on(table.errorType),
]);

// Log scans table - tracks latest scanned block per chain for cron jobs
export const logScans = pgTable('log_scans', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  chainId: integer('chain_id').notNull().references(() => chains.id, { onDelete: 'cascade' }).unique(),
  latestScannedBlock: bigint('latest_scanned_block', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('idx_log_scans_chain_id').on(table.chainId),
]);

// Type exports
export type Chain = typeof chains.$inferSelect;
export type NewChain = typeof chains.$inferInsert;

export type EventTopic = typeof eventTopics.$inferSelect;
export type NewEventTopic = typeof eventTopics.$inferInsert;

export type ProcessedLog = typeof processedLogs.$inferSelect;
export type NewProcessedLog = typeof processedLogs.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Auction = typeof auctions.$inferSelect;
export type NewAuction = typeof auctions.$inferInsert;

export type Bid = typeof bids.$inferSelect;
export type NewBid = typeof bids.$inferInsert;

export type ClearingPriceHistory = typeof clearingPriceHistory.$inferSelect;
export type NewClearingPriceHistory = typeof clearingPriceHistory.$inferInsert;

export type ProcessedLogError = typeof processedLogsErrors.$inferSelect;
export type NewProcessedLogError = typeof processedLogsErrors.$inferInsert;

export type LogScan = typeof logScans.$inferSelect;
export type NewLogScan = typeof logScans.$inferInsert;
