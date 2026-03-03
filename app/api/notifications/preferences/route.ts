import { NextRequest, NextResponse } from 'next/server';
import { db, users, notificationPreferences, userNotificationSettings } from '@/lib/db';
import { eq } from 'drizzle-orm';

const DEFAULT_MIN_RAISED = '50';

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

        const defaultPrefs = {
            enabledChannels: [],
            minRaisedAmount: DEFAULT_MIN_RAISED,
            minFdv: null,
            maxFdv: null,
            chainIds: null,
        };

        const defaultSettings = {
            email: '',
            emailVerified: false,
            telegramChatId: '',
            hasWebPush: false,
            hasFarcaster: false,
        };

        if (userRows.length === 0) {
            return NextResponse.json({ preferences: defaultPrefs, settings: defaultSettings });
        }

        const userId = userRows[0].id;

        const [prefRows, settingsRows] = await Promise.all([
            db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1),
            db.select().from(userNotificationSettings).where(eq(userNotificationSettings.userId, userId)).limit(1)
        ]);

        const pref = prefRows[0];
        const settings = settingsRows[0];

        const stripTrailingZeros = (val: any) => val ? String(Number(val)) : null;

        return NextResponse.json({
            preferences: pref ? {
                enabledChannels: (pref.enabledChannels as string[]) ?? [],
                minRaisedAmount: stripTrailingZeros(pref.minRaisedAmount) ?? DEFAULT_MIN_RAISED,
                minFdv: stripTrailingZeros(pref.minFdv),
                maxFdv: stripTrailingZeros(pref.maxFdv),
                chainIds: pref.chainIds ?? null,
            } : defaultPrefs,
            settings: settings ? {
                email: settings.email ?? '',
                emailVerified: settings.emailVerified ?? false,
                telegramChatId: settings.telegramChatId ?? '',
                hasWebPush: !!settings.webPushSubscription,
                hasFarcaster: !!settings.farcasterToken,
            } : defaultSettings,
        });
    } catch (err) {
        console.error('[preferences GET] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

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

    const { enabledChannels, minRaisedAmount, minFdv, maxFdv, chainIds, email, telegramChatId } = body as {
        enabledChannels?: string[];
        minRaisedAmount?: string | number | null;
        minFdv?: string | number | null;
        maxFdv?: string | number | null;
        chainIds?: number[] | null;
        email?: string;
        telegramChatId?: string;
    };

    try {
        const userId = await getOrCreateUserId(walletAddress);

        // Update preferences
        const existingPref = await db
            .select({ id: notificationPreferences.id })
            .from(notificationPreferences)
            .where(eq(notificationPreferences.userId, userId))
            .limit(1);

        const minRaisedStr = minRaisedAmount != null ? String(minRaisedAmount) : null;
        const minFdvStr = minFdv != null ? String(minFdv) : null;
        const maxFdvStr = maxFdv != null ? String(maxFdv) : null;

        if (existingPref.length > 0) {
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

        // Update settings (email, telegram)
        if (email !== undefined || telegramChatId !== undefined) {
            const existingSettings = await db
                .select({ userId: userNotificationSettings.userId, email: userNotificationSettings.email })
                .from(userNotificationSettings)
                .where(eq(userNotificationSettings.userId, userId))
                .limit(1);

            const updates: Record<string, any> = { updatedAt: new Date() };
            if (email !== undefined) updates.email = email === '' ? null : email;
            if (telegramChatId !== undefined) updates.telegramChatId = telegramChatId === '' ? null : telegramChatId;

            if (existingSettings.length > 0) {
                // If email changed, unverify.
                if (email !== undefined && existingSettings[0].email !== email && email !== '') {
                    updates.emailVerified = false;
                }
                await db.update(userNotificationSettings).set(updates).where(eq(userNotificationSettings.userId, userId));
            } else {
                updates.userId = userId;
                updates.emailVerified = false;
                await db.insert(userNotificationSettings).values(updates as any);
            }
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[preferences POST] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
