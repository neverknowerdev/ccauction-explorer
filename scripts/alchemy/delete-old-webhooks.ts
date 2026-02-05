/**
 * Delete only old Alchemy CCA webhooks (prefix index strictly less than latest).
 *
 * Lists all webhooks, finds the latest CCA prefix index (e.g. CCA3 -> 3), then deletes
 * only webhooks whose name matches CCA(n) with n < latest. Never deletes the latest
 * generation or any non-CCA webhooks.
 *
 * Auth: ALCHEMY_AUTH_TOKEN.
 *
 * Run: ALCHEMY_AUTH_TOKEN=xxx yarn alchemy-delete-old-webhooks
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

async function deleteWebhook(authToken: string, webhookId: string): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const res = await fetch(
      `${ALCHEMY_API_BASE}/delete-webhook?webhook_id=${encodeURIComponent(webhookId)}`,
      {
        method: 'DELETE',
        headers: { 'X-Alchemy-Token': authToken },
      }
    );
    const text = await res.text();
    if (res.ok) return;
    logAlchemyError(`delete-webhook (webhook_id=${webhookId}, attempt=${attempt})`, res, text);
    lastError = new Error(`Delete webhook ${webhookId} failed (${res.status}): ${text}`);
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

/** Webhooks with CCA prefix and index strictly less than latest (candidates for deletion). */
function webhooksToDelete(webhooks: AlchemyWebhook[], latestIndex: number): AlchemyWebhook[] {
  const toDelete: AlchemyWebhook[] = [];
  for (const w of webhooks) {
    const name = w.name ?? '';
    const m = name.match(CCA_NAME_PREFIX_RE);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n < latestIndex) toDelete.push(w);
    }
  }
  return toDelete;
}

async function main() {
  const authToken = getAuthToken();

  const all = await listWebhooks(authToken);
  const latestIndex = getLatestCCAPrefixIndex(all);
  const toDelete = webhooksToDelete(all, latestIndex);

  console.log('Total webhooks:', all.length);
  console.log('Latest CCA prefix index:', latestIndex);
  console.log('Webhooks to delete (index <', latestIndex + '):', toDelete.length);

  if (toDelete.length === 0) {
    console.log(
      'Only one CCA prefix index (CCA' + latestIndex + ') present (or no CCA webhooks); not deleting any webhooks.'
    );
    return;
  }

  for (const w of toDelete) {
    await deleteWebhook(authToken, w.id);
    console.log('  Deleted', w.name ?? w.id, w.id);
  }

  console.log('Done. Deleted', toDelete.length, 'old CCA webhooks.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
