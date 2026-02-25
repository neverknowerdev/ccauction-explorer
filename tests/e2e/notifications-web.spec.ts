import { test, expect } from '@playwright/test';

test.describe('Web Push Notifications E2E', () => {

  test('Connect Wallet and Save Notification Preferences', async ({ page }) => {
    // 1. Visit App
    await page.goto('/');

    // 2. Connect Wallet via Dynamic Test Account
    const connectBtn = page.getByRole('button', { name: /Connect Wallet/i });

    // If we are already connected (mocked or persisted), skip
    if (await connectBtn.isVisible()) {
      await connectBtn.click();

      // Select Email Wallet
      await page.waitForTimeout(2000);

      const emailInput = page.getByTestId('dynamic-email-input').or(page.getByPlaceholder(/email/i)).first();

      if (await emailInput.isVisible()) {
          // Use CORRECT test email format
          await emailInput.fill('testing+dynamic_test@dynamic.xyz');
          // Find submit button
          await page.getByRole('button', { name: /Continue/i }).click();

          const otp = process.env.DYNAMIC_TEST_ACCOUNT_OTP;
          // Wait for OTP field
          const otpInput = page.getByRole('textbox').first();
          await expect(otpInput).toBeVisible({ timeout: 10000 });
          if (otp) await otpInput.fill(otp);
      }
    }

    // 3. Navigate to Notifications
    await page.goto('/account/notifications');

    // 4. Interact
    await page.context().grantPermissions(['notifications']);

    // Find toggle by Test ID
    const webNotifToggle = page.getByTestId('toggle-push');

    // Wait for it to be visible
    await expect(webNotifToggle).toBeVisible();
    await webNotifToggle.click();

    // Fill Input
    await page.getByPlaceholder('e.g. 1000').fill('500');

    // Save
    page.on('dialog', d => d.accept());
    await page.getByRole('button', { name: /Save/i }).click();

    // 5. Verify Persistence
    await page.reload();
    await expect(page.getByPlaceholder('e.g. 1000')).toHaveValue('500');
  });
});
