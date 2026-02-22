# Notification System

## Overview
This feature allows users to subscribe to auction alerts via multiple channels:
- **Browser Web Push**: Using standardized VAPID protocol.
- **Farcaster Mini App**: Direct notifications via Farcaster client.
- **Base Mini App**: Specific integration for Base ecosystem apps.
- **Email (SMTP)**: Standard email delivery.
- **Telegram (Bot)**: Alerts via Telegram bot.

## Setup

### 1. Environment Variables
Add the following to your `.env` file:

```bash
# Web Push (Generate with `npx web-push generate-vapid-keys`)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=password

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
```

### 2. Database
Run migrations to create notification tables:
```bash
./migrations/run-migrations.sh up
```

### 3. Usage
- Go to `/account/notifications` to configure preferences.
- Enable channels and set filters (Min Raised Amount, FDV).
- When an auction matches, notifications are dispatched asynchronously via `notificationService.processAuction`.

## Implementation Details
- **BaseApp**: Uses `baseapp_notification_url` and `baseapp_token` stored in `user_notification_settings`. Sending logic defaults to Farcaster standard or custom URL if provided.
- **Service Worker**: `public/sw.js` handles push events and posts messages to the client for In-App Toasts.
- **Deduplication**: Notifications are tracked in `sent_notifications` to preventing duplicate alerts for the same trigger.
