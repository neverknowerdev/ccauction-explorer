import { NextRequest, NextResponse } from 'next/server';
import { db, sentNotifications, auctions } from '@/lib/db';
import { notificationService } from '@/lib/notifications/service';
import { eq } from 'drizzle-orm';

// Mock Endpoint for E2E Testing
export async function POST(req: NextRequest) {
  // Security check: Only allow in non-production or if specific header/env is set
  // For simplicity in this demo, we check for a custom header or NODE_ENV
  const isCI = process.env.CI === 'true';
  const isDev = process.env.NODE_ENV === 'development';
  const authHeader = req.headers.get('x-test-secret');

  if (!isCI && !isDev && authHeader !== process.env.TEST_SECRET_KEY) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { auctionId, triggerType } = body;

    if (!auctionId) {
      return NextResponse.json({ error: 'Missing auctionId' }, { status: 400 });
    }

    // Process immediately
    await notificationService.processAuction(parseInt(auctionId), triggerType || 'created');

    return NextResponse.json({ success: true, message: 'Test notification triggered' });
  } catch (error) {
    console.error('Error in send-test:', error);
    return NextResponse.json({ error: 'Failed to send test notification' }, { status: 500 });
  }
}
