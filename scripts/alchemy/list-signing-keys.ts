/**
 * List signing keys for all current (latest) CCA webhooks.
 *
 * Uses Alchemy team-webhooks (GET /api/team-webhooks) to list webhooks, finds the
 * latest CCA prefix index, then returns an array of signing_key values for webhooks
 * with that prefix only. Useful for validating incoming webhook requests.
 *
 * Auth: ALCHEMY_AUTH_TOKEN.
 *
 * Run: ALCHEMY_AUTH_TOKEN=xxx yarn alchemy-list-signing-keys
 *
 * Output: JSON array of signing keys to stdout (e.g. for env or DB seed).
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const ALCHEMY_API_BASE = 'https://dashboard.alchemy.com/api';

/** Name must match "CCA" + digits + space (e.g. "CCA1 AuctionCreated [BaseMainnet]") */
const CCA_NAME_PREFIX_RE = /^CCA(\d+)\s/;

type AlchemyWebhook = {
  id: string;
  network?: string;
  webhook_type?: string;
  webhook_url?: string;
  name?: string;
  signing_key?: string;
  [key: string]: unknown;
};

function getAuthToken(): string {
  const token = process.env.ALCHEMY_AUTH_TOKEN;
  if (!token) {
    console.error('Missing ALCHEMY_AUTH_TOKEN. Set it in .env.local or export it.');
    process.exit(1);
  }
  return token;
}

const RETRY_STATUSES = [429, 503];
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function logAlchemyError(context: string, res: Response, bodyText: string): void {
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  let bodyJson: unknown = bodyText;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {
    // keep as string
  }
  console.error('\n--- Alchemy API error details ---');
  console.error('Context:', context);
  console.error('Status:', res.status, res.statusText);
  console.error('Response headers:', JSON.stringify(headers, null, 2));
  console.error('Response body:', JSON.stringify(bodyJson, null, 2));
  console.error('--------------------------------\n');
}

async function listWebhooks(authToken: string): Promise<AlchemyWebhook[]> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const res = await fetch(`${ALCHEMY_API_BASE}/team-webhooks`, {
      method: 'GET',
      headers: { 'X-Alchemy-Token': authToken },
    });
    const text = await res.text();
    if (res.ok) {
      const data = JSON.parse(text) as { data?: AlchemyWebhook[] };
      return Array.isArray(data?.data) ? data.data : [];
    }
    logAlchemyError(`team-webhooks (attempt=${attempt})`, res, text);
    lastError = new Error(`List webhooks failed (${res.status}): ${text}`);
    if (RETRY_STATUSES.includes(res.status) && attempt < RETRY_ATTEMPTS) {
      console.warn(`  Retry ${attempt}/${RETRY_ATTEMPTS} in ${RETRY_DELAY_MS / 1000}s...`);
      await sleep(RETRY_DELAY_MS);
    } else {
      throw lastError;
    }
  }
  throw lastError;
}

/** Returns max CCA index from webhook names (e.g. CCA1, CCA2 -> 2). Returns 0 if none. */
function getLatestCCAPrefixIndex(webhooks: AlchemyWebhook[]): number {
  let maxNum = 0;
  for (const w of webhooks) {
    const name = w.name ?? '';
    const m = name.match(CCA_NAME_PREFIX_RE);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return maxNum;
}

/** Webhooks with CCA prefix and index equal to latest (current generation only). */
function webhooksWithLatestCCAPrefix(
  webhooks: AlchemyWebhook[],
  latestIndex: number
): AlchemyWebhook[] {
  const latest: AlchemyWebhook[] = [];
  for (const w of webhooks) {
    const name = w.name ?? '';
    const m = name.match(CCA_NAME_PREFIX_RE);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n === latestIndex) latest.push(w);
    }
  }
  return latest;
}

async function main() {
  const authToken = getAuthToken();

  const all = await listWebhooks(authToken);
  const latestIndex = getLatestCCAPrefixIndex(all);
  const latestWebhooks = webhooksWithLatestCCAPrefix(all, latestIndex);

  const signingKeys: string[] = latestWebhooks
    .map((w) => w.signing_key)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);

  // Output JSON array to stdout for piping / consumption
  console.log(JSON.stringify(signingKeys, null, 0));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
