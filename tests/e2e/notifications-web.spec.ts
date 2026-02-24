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
      // Note: Dynamic widget selectors are unstable. We try finding by text.
      // Wait for the modal content
      await page.waitForTimeout(2000);

      const emailInput = page.getByTestId('dynamic-email-input').or(page.getByPlaceholder(/email/i)).first();
      // If we can't find specific input, we might be in the wrong view.
      // For E2E reliability with 3rd party widgets, we assume standard flow.

      if (await emailInput.isVisible()) {
          await emailInput.fill('testing@dynamic.xyz');
          // Find submit button
          await page.getByRole('button', { name: /Continue/i }).click();

          const otp = process.env.DYNAMIC_TEST_ACCOUNT_OTP;
          // Wait for OTP field
          const otpInput = page.getByRole('textbox').first();
          await expect(otpInput).toBeVisible({ timeout: 5000 });
          if (otp) await otpInput.fill(otp);
      }
    }

    // 3. Navigate to Notifications
    await page.goto('/account/notifications');

    // 4. Interact
    // Force permission grant
    await page.context().grantPermissions(['notifications']);

    // Find "Web Notifications" toggle
    const webNotifToggle = page.locator('button').filter({ has: page.locator('span') }).first(); // Heuristic for the first toggle

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
