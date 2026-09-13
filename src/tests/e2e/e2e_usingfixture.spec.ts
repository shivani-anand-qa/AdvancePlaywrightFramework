import { test, expect } from '@fixtures/test-base';
import { createLogger } from '@utils/logger';

const log = createLogger('e2e-usingfixture');

const FIRST_ITEM_ID = 'test-allthethings-tshirt-red';

test.describe('@Login E2E Login via fixtures', () => {

    test('shows an error with invalid credentials', async ({ invalidLogin }) => {
        log.info('Verifying the rejection error message');
        const error = await invalidLogin.getErrorMessage();
        expect(error).toContain('do not match any user in this service');
    });

    test('logs in successfully with valid credentials', async ({ validLogin, page }) => {
        log.info('Verifying redirect to the inventory page');
        await expect(page).toHaveURL(/\/inventory\/?$/);
    });

    test('login lands on the inventory page with products loaded', async ({ loginWithInventory }) => {
        log.info('Verifying inventory items are visible');
        const names = await loginWithInventory.productNames();
        expect(names.length).toBeGreaterThan(0);
    });

    test('login with one item already selected in the cart', async ({ loginWithSelectedItem, cartPage }) => {
        log.info(`Verifying "${FIRST_ITEM_ID}" is in the cart`);
        await cartPage.open();
        expect(await cartPage.rowCount()).toBe(1);
    });

});
