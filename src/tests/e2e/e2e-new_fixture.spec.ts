/**
 * Demonstrates the four composable state fixtures from test-base.ts, from the
 * least-prepared state to the most-prepared state:
 *   1. invalidLogin        — locked_out_user stays on the login page with an error.
 *   2. validLogin          — standard_user lands on the inventory page.
 *   3. loginWithInventory  — logged in AND the inventory page is guaranteed loaded.
 *   4. loginWithSelectedItem — logged in, inventory loaded, and one item is
 *      already in the cart. The most-prepared state: the checkout test starts
 *      from here so it skips login + add-to-cart boilerplate entirely.
 *
 * Each test requests exactly one state fixture to prove the states compose and
 * hand off the right page-object + data.
 */

import { test, expect } from '@fixtures/test-base';
import { createLogger } from '@utils/logger';
import { visualStep } from '@utils/visualStep';

const log = createLogger('e2e-new-fixture');

test.describe('@P1 @Regression E2E @Fixtures Composable State Fixtures', () => {
    test('invalid login — locked-out user sees the error and stays on login', async ({
        page,
        invalidLogin,
    }) => {
        const { loginPage, username } = invalidLogin;

        await visualStep(page, 'Verify the locked-out error is shown', async () => {
            log.info(`invalidLogin fixture: ${username}`);
            await expect(page).toHaveURL(/index\.html|\/$/);
            const message = await loginPage.getErrorMessage();
            expect(message.toLowerCase()).toContain('locked out');
        });
    });

    test('valid login — standard_user lands on the inventory page', async ({
        page,
        validLogin,
        inventoryPage,
    }) => {
        await visualStep(page, 'Verify the valid login landed on inventory', async () => {
            log.info('validLogin fixture applied');
            await validLogin.waitForLoginSuccessful();
            await inventoryPage.assertLoaded();
            expect(await inventoryPage.productNames().then((names) => names.length)).toBeGreaterThan(3);
        });
    });

    test('login + inventory — inventory is loaded and ready to browse', async ({
        page,
        loginWithInventory,
    }) => {
        const inventoryPage = loginWithInventory;

        await visualStep(page, 'Verify inventory is loaded via the fixture', async () => {
            log.info('loginWithInventory fixture applied');
            await inventoryPage.assertLoaded();
            expect(await inventoryPage.productNames().then((names) => names.length)).toBeGreaterThan(3);
        });
    });

    test('login + inventory + selected item — checkout starts with the cart pre-filled', async ({
        page,
        loginWithSelectedItem,
        cartPage,
        checkoutStepOnePage,
        checkoutStepTwoPage,
        checkoutCompletePage,
    }) => {
        const { inventoryPage, itemId } = loginWithSelectedItem;

        await visualStep(page, 'Verify the selected item is already in the cart', async () => {
            log.info(`loginWithSelectedItem fixture applied: ${itemId}`);
            await inventoryPage.assertLoaded();
            await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');
        });

        await visualStep(page, 'Open the cart with the pre-selected item', async () => {
            await inventoryPage.openCart();
            await cartPage.assertLoaded();
            expect(await cartPage.rowCount()).toBe(1);
        });

        await visualStep(page, 'Complete checkout step one', async () => {
            await cartPage.checkout();
            await checkoutStepOnePage.assertLoaded();
            await checkoutStepOnePage.fillGuest({
                firstName: 'Fixture',
                lastName: 'User',
                postalCode: '560001',
            });
            await checkoutStepOnePage.continue();
        });

        await visualStep(page, 'Finish the order', async () => {
            await checkoutStepTwoPage.assertLoaded();
            await checkoutStepTwoPage.finish();
        });

        await visualStep(page, 'Order is complete', async () => {
            await checkoutCompletePage.assertOrderComplete();
        });
    });
});
