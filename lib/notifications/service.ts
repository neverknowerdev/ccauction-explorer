import { db, notificationPreferences, userNotificationSettings, sentNotifications, auctions } from '@/lib/db';
import { eq, and, or, isNull, sql } from 'drizzle-orm';
import { NotificationChannelType, NotificationPayload, NotificationTriggerType, UserSettings } from './types';
import { EmailChannel } from './channels/email';
import { TelegramChannel } from './channels/telegram';
import { WebPushChannel } from './channels/web-push';
import { FarcasterChannel } from './channels/farcaster';
import { BaseAppChannel } from './channels/baseapp';

// 1. Define the Channel Registry Type (Strict Typing)
type ChannelRegistry = {
  [key: string]: {
    send: (settings: UserSettings, payload: NotificationPayload) => Promise<boolean>;
  };
};

// 2. Initialize Channels
const channels: ChannelRegistry = {
  email: new EmailChannel(),
  telegram: new TelegramChannel(),
  web_push: new WebPushChannel(),
  farcaster: new FarcasterChannel(),
  baseapp: new BaseAppChannel(),
};

export const notificationService = {
  async processAuction(auctionId: number, triggerType: NotificationTriggerType) {
    console.log(`Processing notifications for auction ${auctionId} (${triggerType})`);

    try {
      // 1. Fetch Auction Details
      const auctionResult = await db.select().from(auctions).where(eq(auctions.id, auctionId));
      const auction = auctionResult[0];

      if (!auction) {
        console.error('Auction not found:', auctionId);
        return;
      }

      // 2. Prepare Notification Payload
      const title = triggerType === 'created' ? 'New Auction Created!' : 'Auction Target Reached!';
      const tokenInfo = auction.tokenInfo as any;
      const tokenName = tokenInfo?.name || 'Token';
      const chainName = 'Base'; // Hardcoded or fetch from chains table if available
      const body = `${tokenName} auction is now live on ${chainName}.`;
      const url = `https://ccauction.com/auctions/${auction.chainId}/${auction.address}`;

      const payload: NotificationPayload = {
        title,
        body,
        url,
        imageUrl: tokenInfo?.icon || undefined,
      };

      // 3. Query Preferences
      const relevantPreferences = await db
        .select({
          pref: notificationPreferences,
          settings: userNotificationSettings,
        })
        .from(notificationPreferences)
        .innerJoin(userNotificationSettings, eq(notificationPreferences.userId, userNotificationSettings.userId))
        .where(
             // Use SQL template literal for the array check
             sql`${notificationPreferences.chainIds} IS NULL OR ${auction.chainId} = ANY(${notificationPreferences.chainIds})`
        );

      console.log(`Found ${relevantPreferences.length} potential recipients (before manual filtering)`);

      const promises = relevantPreferences.map(async ({ pref, settings }) => {
        // --- Filter Logic ---
        const currentRaised = parseFloat(auction.collectedAmountUsd || '0');
        // Estimate FDV: current clearing price * total supply
        const totalSupply = parseFloat((auction.tokenInfo as any)?.totalSupply || '0');
        const clearingPrice = parseFloat(auction.currentClearingPrice || '0');
        const currentFdv = clearingPrice * totalSupply;

        // Min Raised Amount Check
        if (pref.minRaisedAmount && triggerType === 'raised_amount') {
          const minRaised = parseFloat(pref.minRaisedAmount);
          if (currentRaised < minRaised) return;
        }

        // Min FDV Check
        if (pref.minFdv) {
          const minFdv = parseFloat(pref.minFdv);
          if (currentFdv < minFdv) return;
        }

        // Max FDV Check
        if (pref.maxFdv) {
          const maxFdv = parseFloat(pref.maxFdv);
          if (currentFdv > maxFdv) return;
        }

        // --- Channel Processing ---
        const enabledChannels = (pref.enabledChannels as string[]) || [];

        for (const channelKey of enabledChannels) {
          const channelName = channelKey as NotificationChannelType;

          if (!channels[channelName]) {
            console.warn(`Unknown channel: ${channelName}`);
            continue;
          }

          // Check Deduplication
          const alreadySent = await db
            .select()
            .from(sentNotifications)
            .where(
              and(
                eq(sentNotifications.auctionId, auctionId),
                eq(sentNotifications.userId, pref.userId),
                eq(sentNotifications.triggerType, triggerType),
                eq(sentNotifications.channel, channelName)
              )
            )
            .limit(1);

          if (alreadySent.length > 0) {
            continue;
          }

          // Send Notification
          const channelImpl = channels[channelName];
          const success = await channelImpl.send(settings as UserSettings, payload);

          if (success) {
            // Log Success
            await db
              .insert(sentNotifications)
              .values({
                auctionId,
                userId: pref.userId,
                triggerType,
                channel: channelName,
                sentAt: new Date(),
              })
              .onConflictDoNothing();

            console.log(`Sent notification to ${pref.userId} via ${channelName}`);
          }
        }
      });

      await Promise.all(promises);
      console.log('Notification processing complete.');

    } catch (error) {
      console.error('Error in notificationService.processAuction:', error);
    }
  }
};
