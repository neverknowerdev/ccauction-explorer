import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const insertCalls: any[] = [];

vi.mock('@/lib/db', () => {
  return {
    db: {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((values: any) => {
          insertCalls.push(values);
          return Promise.resolve();
        }),
      })),
    },
    ethPrices: {},
  };
});

vi.mock('@/lib/providers', () => {
  return {
    getEthUsdPrice: vi.fn(),
  };
});

import { GET } from './route';
import { getEthUsdPrice } from '@/lib/providers';

describe('ETH Prices Cron', () => {
  beforeEach(() => {
    insertCalls.length = 0;
    vi.clearAllMocks();
  });

  it('stores ETH/USD price', async () => {
    (getEthUsdPrice as ReturnType<typeof vi.fn>).mockResolvedValue(2400);

    const request = new NextRequest('http://localhost/api/cron/eth-prices');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0]).toMatchObject({ price: '2400' });
  });
});
