-- Notification schema

-- User Notification Settings: Stores credentials and subscription details for each channel
CREATE TABLE user_notification_settings (
  user_id                     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email                       text,
  email_verified              boolean NOT NULL DEFAULT false,
  telegram_chat_id            text,
  web_push_subscription       jsonb,
  farcaster_token             text,
  farcaster_notification_url  text,
  baseapp_token               text,
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Notification Preferences: Stores the rules/filters for when to notify
CREATE TABLE notification_preferences (
  id                          serial PRIMARY KEY,
  user_id                     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  min_raised_amount           numeric(30, 18),
  min_fdv                     numeric(30, 18),
  max_fdv                     numeric(30, 18),
  chain_ids                   integer[], -- NULL means all chains
  enabled_channels            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Sent Notifications: History log for deduplication and analytics
CREATE TABLE sent_notifications (
  id                          serial PRIMARY KEY,
  auction_id                  bigint NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id                     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type                text NOT NULL, -- 'created', 'raised_amount', etc.
  channel                     text NOT NULL, -- 'email', 'telegram', 'push', etc.
  sent_at                     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(auction_id, user_id, trigger_type, channel)
);

CREATE INDEX idx_sent_notifications_auction_user ON sent_notifications(auction_id, user_id);
