import { NextRequest, NextResponse } from 'next/server';
import { db, users, notificationPreferences } from '@/lib/db';
import { eq } from 'drizzle-orm';

const DEFAULT_MIN_RAISED = '50'; // $50 — filters out typical test/fake auctions

async function getOrCreateUserId(walletAddress: string): Promise<string> {
    const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.primaryWallet, walletAddress))
        .limit(1);

    if (existing.length > 0) return existing[0].id;

    const inserted = await db
        .insert(users)
        .values({ primaryWallet: walletAddress })
        .returning({ id: users.id });
    return inserted[0].id;
}

/**
 * GET /api/notifications/preferences
 * Returns the current notification preferences for the authenticated wallet.
 */
export async function GET(req: NextRequest) {
    const walletAddress = req.headers.get('x-wallet-address')?.toLowerCase();
    if (!walletAddress) {
        return NextResponse.json({ error: 'Missing x-wallet-address header' }, { status: 400 });
    }

    try {
        const userRows = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.primaryWallet, walletAddress))
            .limit(1);

        if (userRows.length === 0) {
            return NextResponse.json({
                preferences: {
                    enabledChannels: [],
                    minRaisedAmount: DEFAULT_MIN_RAISED,
                    minFdv: null,
                    maxFdv: null,
                    chainIds: null,
                },
            });
        }

        const userId = userRows[0].id;
        const prefRows = await db
            .select()
            .from(notificationPreferences)
            .where(eq(notificationPreferences.userId, userId))
            .limit(1);

        if (prefRows.length === 0) {
            return NextResponse.json({
                preferences: {
                    enabledChannels: [],
                    minRaisedAmount: DEFAULT_MIN_RAISED,
                    minFdv: null,
                    maxFdv: null,
                    chainIds: null,
                },
            });
        }

        const pref = prefRows[0];
        return NextResponse.json({
            preferences: {
                enabledChannels: (pref.enabledChannels as string[]) ?? [],
                minRaisedAmount: pref.minRaisedAmount ?? DEFAULT_MIN_RAISED,
                minFdv: pref.minFdv ?? null,
                maxFdv: pref.maxFdv ?? null,
                chainIds: pref.chainIds ?? null,
            },
        });
    } catch (err) {
        console.error('[preferences GET] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/notifications/preferences
 * Creates or updates notification preferences for the authenticated wallet.
 */
export async function POST(req: NextRequest) {
    const walletAddress = req.headers.get('x-wallet-address')?.toLowerCase();
    if (!walletAddress) {
        return NextResponse.json({ error: 'Missing x-wallet-address header' }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { enabledChannels, minRaisedAmount, minFdv, maxFdv, chainIds } = body as {
        enabledChannels?: string[];
        minRaisedAmount?: string | number | null;
        minFdv?: string | number | null;
        maxFdv?: string | number | null;
        chainIds?: number[] | null;
    };

    try {
        const userId = await getOrCreateUserId(walletAddress);

        // Check if a preference row already exists (userId is not a unique constraint)
        const existing = await db
            .select({ id: notificationPreferences.id })
            .from(notificationPreferences)
            .where(eq(notificationPreferences.userId, userId))
            .limit(1);

        const minRaisedStr = minRaisedAmount != null ? String(minRaisedAmount) : null;
        const minFdvStr = minFdv != null ? String(minFdv) : null;
        const maxFdvStr = maxFdv != null ? String(maxFdv) : null;

        if (existing.length > 0) {
            await db
                .update(notificationPreferences)
                .set({
                    enabledChannels: enabledChannels ?? [],
                    minRaisedAmount: minRaisedStr,
                    minFdv: minFdvStr,
                    maxFdv: maxFdvStr,
                    chainIds: chainIds ?? null,
                    updatedAt: new Date(),
                })
                .where(eq(notificationPreferences.userId, userId));
        } else {
            await db.insert(notificationPreferences).values({
                userId,
                enabledChannels: enabledChannels ?? [],
                minRaisedAmount: minRaisedStr,
                minFdv: minFdvStr,
                maxFdv: maxFdvStr,
                chainIds: chainIds ?? null,
            });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[preferences POST] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
