import { NotificationChannel, UserSettings, NotificationPayload } from '../types';

// Type definition for TelegramBot to avoid direct require import issues in strict environments if needed
// We use require inside to handle optional dependency gracefully if configured via ENV
let bot: any = null;

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

if (telegramToken) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TelegramBot = require('node-telegram-bot-api');
    bot = new TelegramBot(telegramToken, { polling: false });
  } catch (e) {
    console.warn('Telegram bot api package found but failed to init', e);
  }
}

export class TelegramChannel implements NotificationChannel {
  async send(settings: UserSettings, payload: NotificationPayload): Promise<boolean> {
    if (!settings.telegramChatId || !bot) {
      // if (!bot) console.warn('Telegram: Token not configured');
      return false;
    }

    try {
      await bot.sendMessage(
        settings.telegramChatId,
        `${payload.title}\n\n${payload.body}\n\n${payload.url}`
      );
      return true;
    } catch (error) {
      console.error('Telegram Error:', error);
      return false;
    }
  }
}
