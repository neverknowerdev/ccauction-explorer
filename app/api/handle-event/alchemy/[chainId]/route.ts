import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import {
  processLogEntry,
  alchemyLogToViemLog,
  type AlchemyLog,
  type ProcessingResult,
} from '@/lib/events';
import { SUPPORTED_CHAIN_IDS } from '@/lib/chains';

const ALLOWED_CHAIN_IDS = new Set(SUPPORTED_CHAIN_IDS);

function isValidSignatureForStringBody(
  body: string,
  signature: string,
  signingKey: string
): boolean {
  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(body, 'utf8');
  const digest = hmac.digest('hex');
  return signature === digest;
}

/**
 * Parse ALCHEMY_SIGNING_KEYS from env. Accepts:
 * - JSON array: ["key1", "key2"]
 * - Comma-separated: key1,key2
 */
function parseSigningKeys(envValue: string | undefined): string[] {
  if (!envValue || envValue.trim() === '') return [];
  const trimmed = envValue.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((k): k is string => typeof k === 'string')
        : [];
    } catch {
      return [];
    }
  }
  return trimmed.split(',').map((k) => k.trim()).filter(Boolean);
}

function parseChainIdParam(chainIdParam: string): number | null {
  const chainId = Number.parseInt(chainIdParam, 10);
  if (Number.isNaN(chainId)) return null;
  if (!ALLOWED_CHAIN_IDS.has(chainId)) return null;
  return chainId;
}

export async function POST(
  request: NextRequest,
  context: { params: { chainId: string } }
) {
  try {
    const chainIdParam = context?.params?.chainId;
    const chainId = parseChainIdParam(chainIdParam);
    if (chainId == null) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported chainId in URL: ${chainIdParam}. Allowed: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const signingKeys = parseSigningKeys(process.env.ALCHEMY_SIGNING_KEYS);

    if (signingKeys.length === 0) {
      console.error('ALCHEMY_SIGNING_KEYS environment variable is not set or empty');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get the raw body as text for signature validation
    const rawBody = await request.text();

    const signature = request.headers.get('X-Alchemy-Signature');

    if (!signature) {
      console.warn('Missing X-Alchemy-Signature header');
      return NextResponse.json(
        { success: false, error: 'Unauthorized - missing signature' },
        { status: 401 }
      );
    }

    const isValidSignature = signingKeys.some((key) =>
      isValidSignatureForStringBody(rawBody, signature, key)
    );

    if (!isValidSignature) {
      console.warn('Invalid signature - request not from Alchemy');
      return NextResponse.json(
        { success: false, error: 'Unauthorized - invalid signature' },
        { status: 401 }
      );
    }

    // Parse request body as JSON
    const body = JSON.parse(rawBody);

    // Extract block data from the nested structure
    const block = body?.event?.data?.block;

    if (!block) {
      console.warn('No block data found in request body');
      return NextResponse.json(
        { success: false, error: 'Invalid request format' },
        { status: 400 }
      );
    }

    // Extract block info
    const blockNumber = parseInt(block.number, 16); // Alchemy sends hex
    const blockHash = block.hash;
    const timestamp = block.timestamp;
    // Parse timestamp: Alchemy sends hex or decimal string
    const blockTimestamp = new Date(
      (typeof timestamp === 'string' && timestamp.startsWith('0x')
        ? parseInt(timestamp, 16)
        : parseInt(timestamp, 10)) * 1000
    );
    const alchemyLogs: AlchemyLog[] = block.logs || [];

    console.log('=== Alchemy Webhook Event ===');
    console.log('Chain ID (from URL):', chainId);
    console.log('Block Number:', blockNumber);
    console.log('Block Hash:', blockHash);
    console.log('Timestamp:', timestamp);
    console.log('Logs Count:', alchemyLogs.length);
    console.log('');

    // Process each log using shared processor (event topics loaded and cached inside processor)
    const results: ProcessingResult[] = [];
    for (const alchemyLog of alchemyLogs) {
      // Convert Alchemy format to viem Log
      const viemLog = alchemyLogToViemLog(alchemyLog, blockNumber, blockHash);

      const result = await processLogEntry(viemLog, {
        chainId,
        blockNumber,
        blockTimestamp,
        source: 'ALCHEMY_WEBHOOK',
        verbose: true,
      });
      results.push(result);
    }

    const processed = results.filter(r => r.status === 'processed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;

    console.log('============================');
    console.log(`Summary: ${processed} processed, ${skipped} skipped, ${errors} errors`);
    console.log('============================');

    return NextResponse.json({
      success: true,
      message: 'Event received and processed',
      chainId,
      blockNumber,
      blockHash,
      timestamp,
      logsCount: alchemyLogs.length,
      processed,
      skipped,
      errors,
    });
  } catch (error) {
    console.error('Error in handle-event/alchemy/[chainId]:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process event' },
      { status: 500 }
    );
  }
}
