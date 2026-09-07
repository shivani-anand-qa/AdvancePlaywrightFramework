/**
 * End-to-end browse-and-cart flows built on the shared state fixtures:
 *   A) validLogin + loginWithSelectedItem — login and an item are already set
 *      up by the fixture, so the test starts on the inventory page with the
 *      cart pre-populated.
 *   B) loginWithInventory — the user is already logged in and on the
 *      inventory page; the test browses a product detail page, adds it to the
 *      cart and verifies the cart contents.
 */

import { test, expect } from '@fixtures/test-base';
import { createLogger } from '@utils/logger';
import { visualStep } from '@utils/visualStep';

const log = createLogger('e2e-browse-and-cart');

// Products offered on the TTACart inventory page.
const ITEM_ID = 'test-allthethings-tshirt-red';
const SECOND_ITEM_ID = 'tta-bike-light';

test.describe('@P1 @Regression E2E @Cart Browse-and-Cart Feature', () => {
    test('starts from the login+selected-item fixtures and completes checkout', async ({
        page,
        validLogin,
        loginWithSelectedItem,
        cartPage,
        checkoutStepOnePage,
        checkoutStepTwoPage,
        checkoutCompletePage,
    }) => {
        const { inventoryPage, itemId } = loginWithSelectedItem;

        // Both fixtures are already applied: logged in AND one item in the cart.
        log.info('validLogin + loginWithSelectedItem applied; item in cart');

        await visualStep(page, 'Verify login state and pre-added item', async () => {
            expect(validLogin).toBeTruthy();
            await inventoryPage.assertLoaded();
            await expect(page.locator('[data-test="shopping-cart-badge"]')).toHaveText('1');
        });

        await visualStep(page, 'Open the cart with the pre-added item', async () => {
            await inventoryPage.openCart();
            await cartPage.assertLoaded();
            expect(await cartPage.rowCount()).toBe(1);
        });

        await visualStep(page, 'Fill guest details (checkout step one)', async () => {
            await cartPage.checkout();
            await checkoutStepOnePage.assertLoaded();
            await checkoutStepOnePage.fillGuest({
                firstName: 'TTA',
                lastName: 'Fixture',
                postalCode: '560001',
            });
            await checkoutStepOnePage.continue();
        });

        await visualStep(page, 'Finish the order (checkout step two)', async () => {
            await checkoutStepTwoPage.assertLoaded();
            await checkoutStepTwoPage.finish();
        });

        await visualStep(page, 'Order is complete', async () => {
            await checkoutCompletePage.assertOrderComplete();
        });
    });

    test('browses a product detail page and manages the cart via inventory fixture', async ({
        page,
        loginWithInventory,
        itemDetailPage,
        cartPage,
    }) => {
        const inventoryPage = loginWithInventory;

        // Already logged in and on the inventory page thanks to the fixture.
        log.info('loginWithInventory applied; browsing from the inventory page');

        await visualStep(page, 'Open a product detail page', async () => {
            await inventoryPage.openItem(ITEM_ID);
            await itemDetailPage.assertLoaded(ITEM_ID);
        });

        await visualStep(page, 'Add the item from the detail page', async () => {
            await itemDetailPage.addToCart();
        });

        await visualStep(page, 'Back to inventory and add a second item', async () => {
            await itemDetailPage.back();
            await inventoryPage.addToCart(SECOND_ITEM_ID);
        });

        await visualStep(page, 'Open the cart and verify both items', async () => {
            await inventoryPage.openCart();
            await cartPage.assertLoaded();
            expect(await cartPage.rowCount()).toBe(2);
        });

        await visualStep(page, 'Remove one item from the cart', async () => {
            await cartPage.remove(ITEM_ID);
            expect(await cartPage.rowCount()).toBe(1);
        });
    });
});
