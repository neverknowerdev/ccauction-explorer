import { NextRequest, NextResponse } from 'next/server';
import { db, sentNotifications, auctions } from '@/lib/db';
import { notificationService } from '@/lib/notifications/service';
import { eq } from 'drizzle-orm';

// Mock Endpoint for E2E Testing
export async function POST(req: NextRequest) {
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
