import * as webpush from 'web-push';
import { NotificationChannel, UserSettings, NotificationPayload } from '../types';

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (publicVapidKey && privateVapidKey) {
  try {
    webpush.setVapidDetails(
        'mailto:support@ccauction.com',
        publicVapidKey,
        privateVapidKey
    );
  } catch (e) {
      console.warn('Failed to set VAPID details', e);
  }
}

export class WebPushChannel implements NotificationChannel {
  async send(settings: UserSettings, payload: NotificationPayload): Promise<boolean> {
    if (!settings.webPushSubscription) {
      return false;
    }

    if (!publicVapidKey || !privateVapidKey) {
      // console.warn('WebPush: VAPID keys not configured');
      return false;
    }

    try {
      const notificationData = JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        icon: payload.imageUrl,
      });

      await webpush.sendNotification(
        settings.webPushSubscription,
        notificationData
      );
      return true;
    } catch (error) {
      console.error('WebPush Error:', error);
      return false;
    }
  }
}
