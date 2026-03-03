import { test, expect } from '@playwright/test';

test.describe('Web Push Notifications E2E', () => {

  test('Connect Wallet and Save Notification Preferences', async ({ page }) => {
    // 1. Visit App
    await page.goto('/');

    // 2. Connect Wallet via Dynamic Test Account
    const connectBtn = page.getByRole('button', { name: 'Connect Wallet', exact: true });

    if (await connectBtn.isVisible()) {
      await connectBtn.click();
      await page.waitForTimeout(2000);

      const emailInput = page.getByTestId('dynamic-email-input').or(page.getByPlaceholder(/email/i)).first();

      if (await emailInput.isVisible()) {
        await emailInput.fill('testing+dynamic_test@dynamic.xyz');
        await page.getByRole('button', { name: /Continue/i }).click();

        const otp = process.env.DYNAMIC_TEST_ACCOUNT_OTP;
        const otpInput = page.locator('input:not([disabled])').first();
        await expect(otpInput).toBeVisible({ timeout: 10000 });
        if (otp) await otpInput.fill(otp);

        // Wait for connection to complete
        await expect(page.getByRole('button', { name: 'Connect Wallet', exact: true })).not.toBeVisible({ timeout: 20000 });
      }
    }

    // 3. Navigate to Notifications
    await page.addInitScript(() => {
      if (window.PushManager) {
        window.PushManager.prototype.subscribe = async function () {
          return {
            endpoint: 'https://fcm.googleapis.com/fcm/send/mock-playwright-endpoint',
            keys: { p256dh: 'mock-p256dh', auth: 'mock-auth' },
            toJSON: function () {
              return {
                endpoint: 'https://fcm.googleapis.com/fcm/send/mock-playwright-endpoint',
                keys: { p256dh: 'mock-p256dh', auth: 'mock-auth' }
              };
            },
            unsubscribe: async function () { return true; }
          } as unknown as PushSubscription;
        };
        window.PushManager.prototype.getSubscription = async function () {
          return null;
        };
      }
    });

    await page.goto('/account/notifications');

    // 4. Interact
    await page.context().grantPermissions(['notifications']);

    // Verify unlocked
    await expect(page.getByText('Please connect your wallet')).not.toBeVisible({ timeout: 15000 });

    // Wait for initial data fetch to complete so it doesn't overwrite our inputs later
    await expect(page.getByRole('button', { name: 'Save Preferences' })).toBeEnabled({ timeout: 15000 });

    const webNotifToggle = page.getByTestId('toggle-push');
    await expect(webNotifToggle).toBeVisible();
    if (await webNotifToggle.getAttribute('aria-checked') !== 'true') {
      await webNotifToggle.click();
    }

    // Fill Input
    const minRaisedInput = page.getByPlaceholder('e.g. 50');
    await minRaisedInput.fill('500');

    // Email interactions
    const emailToggleBtn = page.getByText('Email').locator('..').getByRole('button');
    const emailInput = page.getByPlaceholder('you@example.com');
    if (!(await emailInput.isVisible())) {
      await emailToggleBtn.click();
    }
    await expect(emailInput).toBeVisible();
    await emailInput.fill('test@example.com');

    // Telegram interactions
    const telegramToggleBtn = page.getByText('Telegram Bot').locator('..').getByRole('button');
    const telegramInput = page.getByPlaceholder('e.g. 123456789');
    if (!(await telegramInput.isVisible())) {
      await telegramToggleBtn.click();
    }
    await expect(telegramInput).toBeVisible();
    await telegramInput.fill('123456');

    // Save
    page.on('dialog', d => d.accept());
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait a moment for save to potentially commit
    await expect(page.getByText('Preferences saved!')).toBeVisible({ timeout: 10000 });

    // 5. Verify Persistence after Reload
    await page.reload();

    // CRITICAL: Wait for wallet to re-connect and app to initialize
    // The "Loading..." state should appear and disappear
    await expect(page.getByText('Loading...')).not.toBeVisible({ timeout: 20000 });

    // Ensure we are still unlocked (wallet persisted)
    await expect(page.getByText('Please connect your wallet')).not.toBeVisible({ timeout: 10000 });

    // Check value - use polling in case fetch is delayed slightly after loading overlay
    await expect(minRaisedInput).toHaveValue('500', { timeout: 10000 });

    // 6. Verify credentials were saved to DB successfully
    if (process.env.DB_CONNECTION_STRING) {
      const postgres = require('postgres');
      const sql = postgres(process.env.DB_CONNECTION_STRING);
      const settings = await sql`SELECT web_push_subscription FROM user_notification_settings WHERE email = 'test@example.com'`;

      expect(settings.length).toBeGreaterThan(0);
      expect(settings[0].web_push_subscription).not.toBeNull();
      expect(settings[0].web_push_subscription.endpoint).toBeDefined();

      await sql.end();
    }
  });
});
