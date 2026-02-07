/**
 * Core log processing logic.
 * Handles decoding, storing, and processing individual log entries.
 */

import type { Log } from 'viem';
import { eq, and } from 'drizzle-orm';
import { db, processedLogs, processedLogsErrors, getEventTopics } from '@/lib/db';
import { decodeEventData, findEventTopic, processEvent, getErrorType } from '@/lib/events';
import type { EventTopic } from '@/lib/db/schema';
import type { ProcessingResult, ProcessLogOptions, LogSource } from './types';

// =============================================================================
// EVENT TOPICS CACHE
// =============================================================================

let cachedEventTopics: EventTopic[] | null = null;

/**
 * Get known event topics from DB, cached in memory for the process lifetime.
 * Used by processLogEntry and by scan script for eth_getLogs topic filter.
 */
export async function getCachedEventTopics(): Promise<EventTopic[]> {
  if (cachedEventTopics === null) {
    cachedEventTopics = await getEventTopics();
  }
  return cachedEventTopics;
}

/**
 * Clear the cached event topics (useful for testing or forced refresh).
 */
export function clearEventTopicsCache(): void {
  cachedEventTopics = null;
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

/**
 * Atomically claim an errored log for retry processing.
 * Returns the log ID if successfully claimed, null otherwise.
 * This is race-safe: only one request can claim the log.
 */
async function claimErroredLogForRetry(
  chainId: number,
  blockNumber: number,
  transactionHash: string,
  logIndex: number,
  source: LogSource
): Promise<number | null> {
  const claimed = await db
    .update(processedLogs)
    .set({
      isError: false,
      processedAt: new Date(),
      source,
    })
    .where(
      and(
        eq(processedLogs.chainId, chainId),
        eq(processedLogs.blockNumber, blockNumber),
        eq(processedLogs.transactionHash, transactionHash),
        eq(processedLogs.logIndex, logIndex),
        eq(processedLogs.isError, true)
      )
    )
    .returning({ id: processedLogs.id });

  return claimed.length > 0 ? claimed[0].id : null;
}

// =============================================================================
// MAIN LOG PROCESSOR
// =============================================================================

/**
 * Process a single log entry.
 * This is the shared logic used by both webhook handler and scan script.
 */
export async function processLogEntry(
  log: Log,
  options: ProcessLogOptions
): Promise<ProcessingResult> {
  const { chainId, blockTimestamp, source, verbose = false } = options;

  const knownEventTopics = await getCachedEventTopics();

  const transactionHash = log.transactionHash ?? '';
  const logIndex = log.logIndex ?? 0;
  const blockNumber = options.blockNumber ?? Number(log.blockNumber ?? 0);

  if (!transactionHash) {
    return {
      logIndex,
      transactionHash: '',
      status: 'error',
      error: 'Missing transaction hash',
    };
  }

  const topic0 = log.topics?.[0];
  if (!topic0) {
    return {
      logIndex,
      transactionHash,
      status: 'error',
      error: 'Missing topic0',
    };
  }
  // Find matching event topic
  const eventTopic = findEventTopic(knownEventTopics, topic0);

  // Decode event data
  let decodedParams: Record<string, unknown> | null = null;
  let eventTopicId: number | null = null;

  if (eventTopic) {
    try {
      const decoded = decodeEventData(
        eventTopic,
        log.topics as string[],
        log.data
      );
      decodedParams = decoded.params;
      eventTopicId = decoded.eventTopicId;
    } catch (error) {
      console.warn(`Failed to decode event ${eventTopic.eventName}:`, error);
    }
  }

  let processedLogId: number;
  let isRetry = false;

  // Try to INSERT the new log first
  const inserted = await db
    .insert(processedLogs)
    .values({
      chainId,
      blockNumber,
      transactionHash,
      logIndex,
      eventTopicId,
      contractAddress: log.address ?? null,
      params: decodedParams,
      source,
    })
    .onConflictDoNothing({
      target: [
        processedLogs.chainId,
        processedLogs.blockNumber,
        processedLogs.transactionHash,
        processedLogs.logIndex,
      ],
    })
    .returning({ id: processedLogs.id });

  if (inserted.length > 0) {
    processedLogId = inserted[0].id;
  } else {
    // Conflict: log already exists - try to claim if errored
    const claimedId = await claimErroredLogForRetry(
      chainId,
      blockNumber,
      transactionHash,
      logIndex,
      source
    );

    if (claimedId !== null) {
      processedLogId = claimedId;
      isRetry = true;
      if (verbose) {
        console.log(`Claimed errored log for retry: chain=${chainId}, block=${blockNumber}, tx=${transactionHash}, index=${logIndex}`);
      }
    } else {
      // Log was already processed successfully
      return {
        logIndex,
        transactionHash,
        status: 'skipped',
      };
    }
  }

  const eventName = eventTopic?.eventName ?? 'Unknown';

  // Log processing info
  if (verbose) {
    console.log(`=== ${isRetry ? 'Retrying' : 'Processing New'} Log ===`);
    console.log(`  ID: ${processedLogId}`);
    console.log(`  Chain: ${chainId}`);
    console.log(`  Block: ${blockNumber}`);
    console.log(`  Transaction: ${transactionHash}`);
    console.log(`  Log Index: ${logIndex}`);
    console.log(`  Event: ${eventName}`);
    console.log(`  Contract: ${log.address}`);
    if (decodedParams) {
      console.log(`  Params: ${JSON.stringify(decodedParams, null, 2)}`);
    }
    console.log('=========================');
  } else {
    const d = blockTimestamp;
    const dateStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(-2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    console.log(`  [${isRetry ? 'RETRY' : 'NEW'}] Block ${blockNumber} (${dateStr}) | ${eventName} | ${log.address} | tx ${transactionHash}`);
  }

  // Process the event (create/update domain records)
  if (eventTopic && decodedParams) {
    try {
      await processEvent(eventName, {
        chainId,
        blockNumber,
        transactionHash,
        contractAddress: log.address ?? '',
        params: decodedParams,
        timestamp: blockTimestamp,
        processedLogId,
      });

      // On successful retry, clean up old error records
      if (isRetry) {
        await db
          .delete(processedLogsErrors)
          .where(eq(processedLogsErrors.processedLogId, processedLogId));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = getErrorType(error);

      // Scan script: one-line log only (no stack trace), in red. Webhook: full error for debugging.
      if (source === 'scanScript') {
        console.error(`\x1b[31mFailed to process event ${eventName}: ${errorMessage}\x1b[0m`);
      } else {
        console.error(`Failed to process event ${eventName}:`, error);
      }

      // Mark the log as having an error
      await db
        .update(processedLogs)
        .set({ isError: true })
        .where(eq(processedLogs.id, processedLogId));

      // Record the error for debugging with error type
      const stacktrace = error instanceof Error ? error.stack ?? null : null;
      await db.insert(processedLogsErrors).values({
        processedLogId,
        errorType,
        error: errorMessage,
        stacktrace,
      });

      return {
        logIndex,
        transactionHash,
        status: 'error',
        eventName,
        error: errorMessage,
        errorType,
      };
    }
  }

  return {
    logIndex,
    transactionHash,
    status: 'processed',
    eventName,
  };
}
