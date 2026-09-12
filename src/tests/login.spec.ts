import { test, expect } from '@playwright/test'
import { LoginPage } from '@pages/LoginPage'

test.describe('TTA Cart Login', () => {

    test('standard_user can login and lands on the inventory page', async ({ page }) => {
        const login = new LoginPage(page);

        await test.step('Open the TTACart login page', async () => {
            await login.open();
        });
        await test.step('Login as standard user', async () => {
            await login.loginAs('standard_user', 'tta_secret');
        });
        await test.step('Verify redirect to the inventory page', async () => {
            await expect(page).toHaveURL(/\/inventory\/?$/);
            await expect(page.locator('[data-test = "inventory-sidebar-link"]')).toBeVisible();
        });
    });

    test('locked_out_user is rejected with an error message', async ({ page }) => {
        const login = new LoginPage(page);

        await test.step('Open the TTACart login page', async () => {
            await login.open();
        });
        await test.step('Login as locked_out_user', async () => {
            await login.loginAs('locked_out_user', 'tta_secret');
        });
        await test.step('Verify lock-out error message is shown', async () => {
            await expect(page).toHaveURL(/index\.html |\/$/);
            expect(await login.getErrorMessage()).toContain('locked out');
        });

    });

});