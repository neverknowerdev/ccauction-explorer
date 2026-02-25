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

          // CRITICAL: Wait for connection to complete
          // Wait for the Connect button to disappear or a wallet address to appear
          await expect(page.getByRole('button', { name: /Connect Wallet/i })).not.toBeVisible({ timeout: 20000 });
          // Optional: Verify address is visible in header (depends on UI)
          // await expect(page.getByText(/^0x/)).toBeVisible();
      }
    }

    // 3. Navigate to Notifications
    await page.goto('/account/notifications');

    // 4. Interact
    await page.context().grantPermissions(['notifications']);

    // Verify UI is unlocked
    await expect(page.getByText('Please connect your wallet')).not.toBeVisible();

    const webNotifToggle = page.getByTestId('toggle-push');
    await expect(webNotifToggle).toBeVisible();
    await expect(webNotifToggle).toBeEnabled();

    await webNotifToggle.click();

    // Fill Input
    await page.getByPlaceholder('e.g. 1000').fill('500');

    // Save
    page.on('dialog', d => d.accept());
    await page.getByRole('button', { name: /Save/i }).click();

    // 5. Verify Persistence
    await page.reload();
    // Wait for loading to finish if there's a loading state
    await expect(page.getByText('Loading...')).not.toBeVisible();
    await expect(page.getByPlaceholder('e.g. 1000')).toHaveValue('500');
  });
});
