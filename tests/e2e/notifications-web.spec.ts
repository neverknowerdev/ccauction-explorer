import { test, expect } from '@playwright/test';

test.describe('Web Push Notifications E2E', () => {

  test('Connect Wallet and Save Notification Preferences', async ({ page }) => {
    // 1. Visit App
    await page.goto('/');

    // 2. Connect Wallet via Dynamic Test Account
    const connectBtn = page.getByRole('button', { name: /Connect Wallet/i });

    if (await connectBtn.isVisible()) {
      await connectBtn.click();
      await page.waitForTimeout(2000);

      const emailInput = page.getByTestId('dynamic-email-input').or(page.getByPlaceholder(/email/i)).first();

      if (await emailInput.isVisible()) {
          await emailInput.fill('testing+dynamic_test@dynamic.xyz');
          await page.getByRole('button', { name: /Continue/i }).click();

          const otp = process.env.DYNAMIC_TEST_ACCOUNT_OTP;
          const otpInput = page.getByRole('textbox').first();
          await expect(otpInput).toBeVisible({ timeout: 10000 });
          if (otp) await otpInput.fill(otp);

          // Wait for connection to complete
          await expect(page.getByRole('button', { name: /Connect Wallet/i })).not.toBeVisible({ timeout: 20000 });
      }
    }

    // 3. Navigate to Notifications
    await page.goto('/account/notifications');

    // 4. Interact
    await page.context().grantPermissions(['notifications']);

    // Verify unlocked
    await expect(page.getByText('Please connect your wallet')).not.toBeVisible({ timeout: 15000 });

    const webNotifToggle = page.getByTestId('toggle-push');
    await expect(webNotifToggle).toBeVisible();
    await webNotifToggle.click();

    // Fill Input
    const minRaisedInput = page.getByPlaceholder('e.g. 1000');
    await minRaisedInput.fill('500');

    // Save
    page.on('dialog', d => d.accept());
    await page.getByRole('button', { name: /Save/i }).click();

    // Wait a moment for save to potentially commit
    await page.waitForTimeout(1000);

    // 5. Verify Persistence after Reload
    await page.reload();

    // CRITICAL: Wait for wallet to re-connect and app to initialize
    // The "Loading..." state should appear and disappear
    await expect(page.getByText('Loading...')).not.toBeVisible({ timeout: 20000 });

    // Ensure we are still unlocked (wallet persisted)
    await expect(page.getByText('Please connect your wallet')).not.toBeVisible({ timeout: 10000 });

    // Check value - use polling in case fetch is delayed slightly after loading overlay
    await expect(minRaisedInput).toHaveValue('500', { timeout: 10000 });
  });
});
