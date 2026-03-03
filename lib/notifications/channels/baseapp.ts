import { NotificationChannel, UserSettings, NotificationPayload } from '../types';

export class BaseAppChannel implements NotificationChannel {
  async send(settings: UserSettings, payload: NotificationPayload): Promise<boolean> {
    if (!settings.baseappToken) {
      // console.warn('BaseApp: Token missing');
      return false;
    }
    // Placeholder logic
    return true;
  }
}
