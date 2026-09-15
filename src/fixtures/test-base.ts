// Inbuilt fixtures are already available in this case. 

/**
 * test-base — the project's custom Playwright `test`, pre-wired with a fixture
 * for every TTACart Page Object.
 *
 * Instead of `new LoginPage(page)` in each spec, ask for the page you need and
 * it's handed over already constructed against the test's `page`:
 * Plain page-object fixtures hand over constructed objects without navigating.
 * State fixtures (`invalidLogin`, `validLogin`, `loginWithInventory`, and
 * `loginWithSelectedItem`) perform reusable setup only when a test requests one.
 */

import { test as base } from '@playwright/test';
import { LoginPage } from '@pages/LoginPage';
import { InventoryPage } from '@pages/InventoryPage';
import { ItemDetailPage } from '@pages/ItemDetailPage';
import { CartPage } from '@pages/CartPage';
import { CheckoutStepOnePage } from '@pages/CheckoutStepOnePage';
import { CheckoutStepTwoPage } from '@pages/CheckoutStepTwoPage';
import { CheckoutCompletePage } from '@pages/CheckoutCompletePage';
import { DataGenerator } from '@utils/DataGenerator';
import loginData from '@testdata/logintestdata.json';

// First product card on the TTACart inventory page.
const FIRST_ITEM_ID = 'test-allthethings-tshirt-red';

export type TestFixture = {

    //Page Objects
    loginPage: LoginPage;
    inventoryPage: InventoryPage;
    itemDetailPage: ItemDetailPage;
    cartPage: CartPage;
    checkoutStepOnePage: CheckoutStepOnePage;
    checkoutStepTwoPage: CheckoutStepTwoPage;
    checkoutCompletePage: CheckoutCompletePage;

    //State fixtures
    invalidLogin: LoginPage;
    validLogin: LoginPage;
    loginWithInventory: InventoryPage;
    loginWithSelectedItem: InventoryPage;

};

export const test = base.extend<TestFixture>({

    loginPage: async ({ page }, use) => {
        await use(new LoginPage(page));
    },

    inventoryPage: async ({ page }, use) => {
        await use(new InventoryPage(page));
    },

    itemDetailPage: async ({ page }, use) => {
        await use(new ItemDetailPage(page));
    },

    cartPage: async ({ page }, use) => {
        await use(new CartPage(page));
    },
    checkoutStepOnePage: async ({ page }, use) => {
        await use(new CheckoutStepOnePage(page));
    },
    checkoutStepTwoPage: async ({ page }, use) => {
        await use(new CheckoutStepTwoPage(page));
    },
    checkoutCompletePage: async ({ page }, use) => {
        await use(new CheckoutCompletePage(page));
    },

    // State fixtures - reusable setup performed only when a test asks for it.

    invalidLogin: async ({ loginPage }, use) => {
        const { username, password } = DataGenerator.credentials();
        await loginPage.open();
        await loginPage.loginAs(username, password);
        await use(loginPage);
    },

    validLogin: async ({ loginPage }, use) => {
        const { username } = loginData.users[0];
        await loginPage.open();
        await loginPage.loginAs(username, loginData.password);
        await loginPage.waitForLoginSuccessful();
        await use(loginPage);
    },

    loginWithInventory: async ({ validLogin, inventoryPage }, use) => {
        await inventoryPage.assertLoaded();
        await use(inventoryPage);
    },

    loginWithSelectedItem: async ({ loginWithInventory, inventoryPage }, use) => {
        await inventoryPage.addToCart(FIRST_ITEM_ID);
        await use(inventoryPage);
    },

});

export { expect } from '@playwright/test';