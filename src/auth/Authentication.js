const Utilities = require('../utils/Utilities');

class Authentication {
    constructor(page, credentials, personality, errorHandler) {
        this.page = page;
        this.username = credentials.username;
        this.password = credentials.password;
        this.personality = personality;
        this.errorHandler = errorHandler;
    }

    async login() {
        try {
            console.log(`${this.personality.name}: Starting login process...`);

            await this.page.goto('https://twitter.com/i/flow/login', {
                waitUntil: 'networkidle0'
            });
            console.log(`${this.personality.name}: Loaded login page`);

            await Utilities.delay(3000);

            // Type username
            console.log(`${this.personality.name}: Looking for username field...`);
            const usernameField = await this.page.waitForSelector('input[autocomplete="username"]', { visible: true });
            await usernameField.type(this.username, { delay: 100 });
            console.log(`${this.personality.name}: Entered username`);

            await Utilities.delay(1000);

            // Find and click the Next button
            console.log(`${this.personality.name}: Looking for Next button...`);
            await Utilities.delay(2000);

            const buttons = await this.page.$$('[role="button"]');
            let nextButtonFound = false;

            for (const button of buttons) {
                const buttonText = await this.page.evaluate(el => el.textContent, button);
                if (buttonText.toLowerCase().includes('next')) {
                    await button.click();
                    nextButtonFound = true;
                    break;
                }
            }

            if (!nextButtonFound) {
                throw new Error('Could not find Next button with correct text');
            }

            console.log(`${this.personality.name}: Clicked Next button`);
            await Utilities.delay(2000);

            // Check if unusual activity detected
            const possibleVerifyField = await this.page.$('input[data-testid="ocfEnterTextTextInput"]');
            if (possibleVerifyField) {
                console.log(`${this.personality.name}: Verification required`);
                throw new Error('Account verification required');
            }

            // Type password
            console.log(`${this.personality.name}: Looking for password field...`);
            const passwordField = await this.page.waitForSelector('input[type="password"]', { visible: true });
            await passwordField.type(this.password, { delay: 100 });
            console.log(`${this.personality.name}: Entered password`);

            await Utilities.delay(1000);

            // Find and click the Login button
            console.log(`${this.personality.name}: Looking for login button...`);
            await Utilities.delay(2000);

            const loginButtons = await this.page.$$('[role="button"]');
            let loginButtonFound = false;

            for (const button of loginButtons) {
                const buttonText = await this.page.evaluate(el => el.textContent, button);
                if (buttonText.toLowerCase().includes('log in')) {
                    await button.click();
                    loginButtonFound = true;
                    break;
                }
            }

            if (!loginButtonFound) {
                throw new Error('Could not find Login button with correct text');
            }

            console.log(`${this.personality.name}: Clicked login button`);
            await Utilities.delay(5000);
            console.log(`${this.personality.name}: Login completed successfully`);

        } catch (error) {
            await this.errorHandler.handleError(error, 'Login');
        }
    }

    async logout() {
        try {
            await Utilities.delay(3000);

            const sidebarAccountSelector = '[data-testid="SideNav_AccountSwitcher_Button"]';
            await this.page.waitForSelector(sidebarAccountSelector, { visible: true });
            await this.page.click(sidebarAccountSelector);
            await Utilities.delay(1500);

            const menuItems = await this.page.$$('[role="menuitem"]');
            let logoutFound = false;

            for (const item of menuItems) {
                const itemText = await this.page.evaluate(el => el.textContent, item);
                if (itemText.toLowerCase().includes('log out')) {
                    await item.click();
                    logoutFound = true;
                    break;
                }
            }

            if (!logoutFound) {
                throw new Error('Could not find Logout menu item');
            }

            // Handle confirmation dialog
            await Utilities.delay(1500);
            const logoutButton = await this.page.waitForSelector('[data-testid="confirmationSheetConfirm"]');
            await logoutButton.click();

            await Utilities.delay(3000);
            console.log(`${this.personality.name}: Successfully logged out`);
        } catch (error) {
            await this.errorHandler.handleError(error, 'Logout');
        }
    }
}

module.exports = Authentication;
