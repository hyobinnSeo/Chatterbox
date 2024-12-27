const Utilities = require('../utils/Utilities');

class Authentication {
    constructor(page, credentials, personality, errorHandler) {
        this.page = page;
        this.username = credentials.username;
        this.password = credentials.password;
        this.email = credentials.email;
        this.personality = personality;
        this.errorHandler = errorHandler;

        if (!this.email) {
            throw new Error('Email is undefined. Please check your environment variables.');
        }
    }

    async login() {
        try {
            // Validate credentials
            if (!this.username || !this.password) {
                throw new Error('Username or password is undefined. Please check your environment variables.');
            }

            console.log(`${this.personality.name}: Starting login process...`);

            await this.page.goto('https://twitter.com/i/flow/login', {
                waitUntil: 'networkidle0'
            });
            console.log(`${this.personality.name}: Loaded login page`);

            await Utilities.delay(3000);

            // Type username
            console.log(`${this.personality.name}: Looking for username field...`);
            const usernameField = await this.page.waitForSelector('input[autocomplete="username"]', { visible: true });
            
            // Log the username value for debugging
            console.log(`${this.personality.name}: Username value:`, typeof this.username, this.username);
            
            // Convert username to string to ensure it's iterable
            const usernameStr = String(this.username);
            await usernameField.type(usernameStr, { delay: 100 });
            console.log(`${this.personality.name}: Entered username`);

            await Utilities.delay(1000);

            // Find and click the Next button
            console.log(`${this.personality.name}: Looking for Next button...`);
            await Utilities.delay(2000);

            const buttons = await this.page.$$('[role="button"]');
            let nextButtonFound = false;

            for (const button of buttons) {
                const buttonText = await this.page.evaluate(el => el.textContent, button);
                // Support both English and Korean button texts
                if (buttonText.toLowerCase().includes('next') || buttonText === '다음') {
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

            // Check for email verification step
            console.log(`${this.personality.name}: Checking for email verification step...`);
            const emailField = await this.page.$('input[autocomplete="email"], input[name="text"], input[type="text"]');
            
            // Check for email heading in both English and Korean
            const pageText = await this.page.evaluate(() => document.body.innerText);
            const isEmailPage = pageText.includes('Email') || pageText.includes('이메일');
            
            if (emailField && isEmailPage) {
                console.log(`${this.personality.name}: Email verification required`);
                // Type email
                await emailField.type(this.email, { delay: 100 });
                console.log(`${this.personality.name}: Entered email`);

                await Utilities.delay(1000);

                // Click next button after email
                const emailNextButtons = await this.page.$$('[role="button"]');
                let emailNextFound = false;

                for (const button of emailNextButtons) {
                    const buttonText = await this.page.evaluate(el => el.textContent, button);
                    if (buttonText.toLowerCase().includes('next') || buttonText === '다음') {
                        await button.click();
                        emailNextFound = true;
                        break;
                    }
                }

                if (!emailNextFound) {
                    throw new Error('Could not find Next button after email entry');
                }

                console.log(`${this.personality.name}: Clicked Next after email`);
                await Utilities.delay(2000);
            }

            // Check if unusual activity detected (only for the actual verification popup)
            const possibleVerifyField = await this.page.$('input[data-testid="ocfEnterTextTextInput"]');
            const verifyHeading = await this.page.$('h1[data-testid="ocfEnterTextHeading"]');
            
            if (possibleVerifyField && verifyHeading) {
                console.log(`${this.personality.name}: Unusual activity verification required`);
                throw new Error('Account verification required');
            }

            // Type password
            console.log(`${this.personality.name}: Looking for password field...`);
            const passwordField = await this.page.waitForSelector('input[type="password"]', { visible: true });
            
            // Log the password type for debugging (not the actual value)
            console.log(`${this.personality.name}: Password value type:`, typeof this.password);
            
            // Convert password to string to ensure it's iterable
            const passwordStr = String(this.password);
            await passwordField.type(passwordStr, { delay: 100 });
            console.log(`${this.personality.name}: Entered password`);

            await Utilities.delay(1000);

            // Find and click the Login button
            console.log(`${this.personality.name}: Looking for login button...`);
            await Utilities.delay(2000);

            const loginButtons = await this.page.$$('[role="button"]');
            let loginButtonFound = false;

            for (const button of loginButtons) {
                const buttonText = await this.page.evaluate(el => el.textContent, button);
                // Support both English and Korean button texts
                if (buttonText.toLowerCase().includes('log in') || buttonText === '로그인' || buttonText === '로그인하기') {
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
                // Support both English and Korean button texts
                // Support both English and Korean menu texts
                if (itemText.toLowerCase().includes('log out') || 
                    itemText === '로그아웃' || 
                    itemText.includes('계정에서 로그아웃')) {
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
