import { NextRequest, NextResponse } from 'next/server';
import { db, users, userNotificationSettings, notificationPreferences } from '@/lib/db';
import { eq } from 'drizzle-orm';

/**
 * POST /api/notifications/register
 *
 * Body (one or both fields may be present):
 *   { webPushSubscription?: PushSubscriptionJSON }
 *   { farcasterToken?: string; farcasterNotificationUrl?: string }
 *
 * Identifies the user by wallet address (header: x-wallet-address).
 * Creates the user row if necessary, then upserts notification settings.
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

    const { webPushSubscription, farcasterToken, farcasterNotificationUrl } = body as {
        webPushSubscription?: unknown;
        farcasterToken?: string;
        farcasterNotificationUrl?: string;
    };

    if (!webPushSubscription && !farcasterToken) {
        return NextResponse.json(
            { error: 'Provide at least one of: webPushSubscription, farcasterToken' },
            { status: 400 }
        );
    }

    try {
        // 1. Upsert user row keyed by wallet address
        const existingUsers = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.primaryWallet, walletAddress))
            .limit(1);

        let userId: string;
        if (existingUsers.length > 0) {
            userId = existingUsers[0].id;
        } else {
            const inserted = await db
                .insert(users)
                .values({ primaryWallet: walletAddress })
                .returning({ id: users.id });
            userId = inserted[0].id;
        }

        // 2. Build the settings update object (only touch what was provided)
        const settingsUpdate: Record<string, unknown> = {
            updatedAt: new Date(),
        };
        if (webPushSubscription !== undefined) {
            settingsUpdate.webPushSubscription = webPushSubscription;
        }
        if (farcasterToken !== undefined) {
            settingsUpdate.farcasterToken = farcasterToken;
        }
        if (farcasterNotificationUrl !== undefined) {
            settingsUpdate.farcasterNotificationUrl = farcasterNotificationUrl;
        }

        // 3. Upsert notification settings
        await db
            .insert(userNotificationSettings)
            .values({ userId, ...settingsUpdate })
            .onConflictDoUpdate({
                target: userNotificationSettings.userId,
                set: settingsUpdate,
            });

        // 4. Ensure at least a default preference row exists (enabledChannels = all active ones)
        const existingPrefs = await db
            .select({ id: notificationPreferences.id })
            .from(notificationPreferences)
            .where(eq(notificationPreferences.userId, userId))
            .limit(1);

        if (existingPrefs.length === 0) {
            const enabledChannels: string[] = [];
            if (webPushSubscription) enabledChannels.push('web_push');
            if (farcasterToken) enabledChannels.push('farcaster');

            await db.insert(notificationPreferences).values({
                userId,
                enabledChannels,
            });
        } else {
            // Merge newly-enabled channels into existing list
            const currentPref = await db
                .select({ enabledChannels: notificationPreferences.enabledChannels })
                .from(notificationPreferences)
                .where(eq(notificationPreferences.userId, userId))
                .limit(1);

            const current = (currentPref[0]?.enabledChannels as string[]) ?? [];
            const toAdd: string[] = [];
            if (webPushSubscription && !current.includes('web_push')) toAdd.push('web_push');
            if (farcasterToken && !current.includes('farcaster')) toAdd.push('farcaster');

            if (toAdd.length > 0) {
                await db
                    .update(notificationPreferences)
                    .set({ enabledChannels: [...current, ...toAdd], updatedAt: new Date() })
                    .where(eq(notificationPreferences.userId, userId));
            }
        }

        return NextResponse.json({ success: true, userId });
    } catch (err) {
        console.error('[notifications/register] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
