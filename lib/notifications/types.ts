export type NotificationTriggerType = 'created' | 'raised_amount';

export type NotificationChannelType = 'email' | 'telegram' | 'web_push' | 'farcaster' | 'baseapp';

export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  imageUrl?: string;
}

export interface UserSettings {
  userId: string;
  email?: string;
  telegramChatId?: string;
  webPushSubscription?: any; // PushSubscription JSON
  farcasterToken?: string;
  farcasterNotificationUrl?: string;
  baseappToken?: string;
}

export interface NotificationChannel {
  send(settings: UserSettings, payload: NotificationPayload): Promise<boolean>;
}
