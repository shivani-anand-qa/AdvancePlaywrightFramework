import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * TTACart login screen.
 *
 *   const login = new LoginPage(page);
 *   await login.open();
 *   await login.loginAs('standard_user', 'tta_secret');
 */

export class LoginPage extends BasePage {

    static readonly PATH = '/playwright/ttacart/';

    private readonly usernameInput: Locator;
    private readonly passwordInput: Locator;
    private readonly loginButton: Locator;
    private readonly errorBox: Locator;
    private readonly inventoryTitle: Locator;
    private readonly loginCredentialsHint: Locator;

    constructor(page: Page) {
        super(page, 'LoginPage');
        this.usernameInput = page.locator('[data-test="username"]');
        this.passwordInput = page.locator('[data-test="password"]');
        this.loginButton = page.locator('[data-test="login-button"]');
        this.inventoryTitle = page.locator('[data-test="title"]');
        this.errorBox = page.locator('[data-test="error"]');
        this.loginCredentialsHint = page.locator('[data-test="login-credentials"]');
    }

    async open(): Promise<void> {
        this.log.info("Open login page");
        await this.goto(LoginPage.PATH);
    }

    async loginAs(username: string, password: string): Promise<void> {
        this.log.info(`loginAs ${username}`);
        await this.el.fill(this.usernameInput, username);
        await this.el.fill(this.passwordInput, password);
        await this.el.click(this.loginButton);

    }

    /**
     * Wait until a successful login lands on the inventory page. Mirrors the
     * assertion used by the login spec.
     */
    async waitForLoginSuccessful(): Promise<void> {
        await expect(this.page).toHaveURL(/\/inventory\/?$/);
        await expect(this.page.locator('[data-test="inventory-sidebar-link"]')).toBeVisible();
        await expect(this.inventoryTitle).toHaveText('Products');
    }

    async getErrorMessage(): Promise<string> {
        await this.el.waitForVisible(this.errorBox);
        return this.el.getText(this.errorBox);
    }

}