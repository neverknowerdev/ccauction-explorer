import { NotificationChannel, UserSettings, NotificationPayload } from '../types';

export class FarcasterChannel implements NotificationChannel {
  async send(settings: UserSettings, payload: NotificationPayload): Promise<boolean> {
    if (!settings.farcasterToken || !settings.farcasterNotificationUrl) {
      // console.warn('Farcaster: Missing token or notification URL for user', settings.userId);
      return false;
    }

    try {
      const response = await fetch(settings.farcasterNotificationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.farcasterToken}`,
        },
        body: JSON.stringify({
          notificationId: `${settings.userId}-${Date.now()}`, // Idempotency
          title: payload.title,
          body: payload.body,
          targetUrl: payload.url,
        }),
      });

      if (!response.ok) {
        console.error('Farcaster Notification Failed:', await response.text());
        return false;
      }

      return true;
    } catch (error) {
      console.error('Farcaster Notification Error:', error);
      return false;
    }
  }
}
