# Notification System

## Overview
This feature allows users to subscribe to auction alerts via multiple channels:
- Browser Web Push
- Farcaster Mini App
- Email (SMTP)
- Telegram (Bot)
- BaseApp (Placeholder)

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

## Testing
- Use `/api/notifications/send-test` to trigger a manual test.
  ```bash
  curl -X POST http://localhost:3000/api/notifications/send-test -d '{"auctionId": "1", "triggerType": "created"}' -H "Content-Type: application/json"
  ```
