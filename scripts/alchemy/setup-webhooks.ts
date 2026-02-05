/**
 * Create new Alchemy Custom Webhooks for CCA factory + auction events.
 *
 * Lists existing webhooks to compute next prefix index (CCA1, CCA2, ...), then creates
 * new webhooks only. Does not delete anything.
 *
 * Auth: ALCHEMY_AUTH_TOKEN, optional ALCHEMY_APP_ID. Webhook URL: first CLI arg or --webhook-url.
 *
 * Run: ALCHEMY_AUTH_TOKEN=xxx yarn alchemy-setup-webhooks https://your-app.com/api/handle-event/alchemy
 *   or: yarn alchemy-setup-webhooks --webhook-url https://...
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const ALCHEMY_API_BASE = 'https://dashboard.alchemy.com/api';

const AUCTION_CREATED_TOPICS = [
  '0x7ede475fad18ccf0039f2b956c4d43a8b4ed0853de4daaa8ae25299f331ae3b9', // CCA Factory AuctionCreated
  '0x8a8cc462d00726e0f8c031dd2d6b9dcdf0794fb27a88579830dadee27d43ea7c', // Uniswap Liquidity Strategy AuctionCreated
];

const AUCTION_EVENTS_TOPICS = [
  '0x17cca138a663106b4c25a247e2d9238888fe37188d83b7bb7287bc1c0a4df82a', // TokensReceived(uint256)
  '0x650baad5cd8ca09b8f580be220fa04ce2ba905a041f764b6a3fe2c848eb70540', // BidSubmitted(...)
  '0x054fe6469466a0b4d2a6ae4b100e5f9c494c958f04b4000f44d470088dd97930', // BidExited(...)
  '0x880f2ef2613b092f1a0a819f294155c98667eb294b7e6bf7a3810278142c1a1c', // TokensClaimed(...)
  '0x30adbe996d7a69a21fdebcc1f8a46270bf6c22d505a7d872c1ab4767aa707609', // ClearingPriceUpdated(...)
];

const CHAINS: { network: string; label: string }[] = [
  { network: 'BASE_MAINNET', label: 'BaseMainnet' },
  { network: 'BASE_SEPOLIA', label: 'BaseSepolia' },
  { network: 'ETH_MAINNET', label: 'EthereumMainnet' },
  { network: 'ETH_SEPOLIA', label: 'EthereumSepolia' },
  { network: 'ARB_MAINNET', label: 'ArbitrumMainnet' },
];

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

function getAppId(): string | undefined {
  return process.env.ALCHEMY_APP_ID;
}

function getWebhookUrl(): string {
  const arg = process.argv.find((a) => a === '--webhook-url');
  const idx = arg ? process.argv.indexOf(arg) + 1 : 1;
  const url = process.argv[idx];
  if (!url || url.startsWith('--')) {
    console.error('Usage: yarn alchemy-setup-webhooks <webhook-url>');
    console.error('   or: yarn alchemy-setup-webhooks --webhook-url <webhook-url>');
    process.exit(1);
  }
  return url;
}

function buildGraphQLQuery(topic0List: string[]): string {
  const topicsArg = JSON.stringify([topic0List]);
  return `{
  block {
    hash,
    number,
    timestamp,
    # Add contract addresses and/or topics to filter for logs
    logs(filter: { addresses: [], topics: ${topicsArg} }) {
      data,
      topics,
      index,
      account {
        address,
      },
      transaction {
        hash,
        nonce,
        index,
        from {
          address,
        },
        to {
          address,
        },
        value,
        gasPrice,
        maxFeePerGas,
        maxPriorityFeePerGas,
        gas,
        status,
        gasUsed,
        cumulativeGasUsed,
        effectiveGasPrice,
        createdContract {
          address,
        },
      },
    },
  },
}`;
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

async function createWebhook(
  authToken: string,
  network: string,
  webhookUrl: string,
  name: string,
  graphqlQuery: string,
  appId?: string
): Promise<string> {
  let lastError: Error | null = null;
  const body: Record<string, unknown> = {
    network,
    webhook_type: 'GRAPHQL',
    webhook_url: webhookUrl,
    name,
    graphql_query: {
      query: graphqlQuery,
      skip_empty_messages: true,
    },
  };
  if (appId) body.app_id = appId;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const res = await fetch(`${ALCHEMY_API_BASE}/create-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Alchemy-Token': authToken,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      const data = JSON.parse(text) as { data?: { id?: string } };
      const id = data?.data?.id;
      if (!id) throw new Error('Create webhook response missing id');
      return id;
    }
    logAlchemyError(`create-webhook (network=${network}, name=${name}, attempt=${attempt})`, res, text);
    lastError = new Error(`Create webhook failed (${res.status}): ${text}`);
    if (RETRY_STATUSES.includes(res.status) && attempt < RETRY_ATTEMPTS) {
      console.warn(`  Retry ${attempt}/${RETRY_ATTEMPTS} in ${RETRY_DELAY_MS / 1000}s...`);
      await sleep(RETRY_DELAY_MS);
    } else {
      throw lastError;
    }
  }
  throw lastError;
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

function nextPrefix(maxNum: number): string {
  return `CCA${maxNum + 1}`;
}

async function main() {
  const authToken = getAuthToken();
  const webhookUrl = getWebhookUrl();
  const appId = getAppId();

  const all = await listWebhooks(authToken);
  const maxNum = getLatestCCAPrefixIndex(all);
  const newPrefix = nextPrefix(maxNum);

  console.log('Webhook URL:', webhookUrl);
  console.log('Latest CCA index:', maxNum, '-> new prefix:', newPrefix);
  if (appId) console.log('App ID:', appId);

  const queryAuctionCreated = buildGraphQLQuery(AUCTION_CREATED_TOPICS);
  const queryAuctionEvents = buildGraphQLQuery(AUCTION_EVENTS_TOPICS);

  for (const { network, label } of CHAINS) {
    const nameAuctionCreated = `${newPrefix} AuctionCreated [${label}]`;
    const nameAuctionEvents = `${newPrefix} AuctionEvents [${label}]`;
    const id1 = await createWebhook(
      authToken,
      network,
      webhookUrl,
      nameAuctionCreated,
      queryAuctionCreated,
      appId
    );
    console.log('Created', nameAuctionCreated, '->', id1);
    const id2 = await createWebhook(
      authToken,
      network,
      webhookUrl,
      nameAuctionEvents,
      queryAuctionEvents,
      appId
    );
    console.log('Created', nameAuctionEvents, '->', id2);
  }

  console.log('Done. New prefix:', newPrefix);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
