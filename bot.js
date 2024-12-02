const puppeteer = require('puppeteer');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

class TwitterBot {
    constructor(credentials, personality) {
        this.username = credentials.username;
        this.password = credentials.password;
        this.personality = personality;
        this.browser = null;
        this.page = null;

        // Initialize OpenAI
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }

    async createChromePrefs() {
        const profileDir = path.join(__dirname, 'chrome-profile');
        if (!fs.existsSync(profileDir)) {
            fs.mkdirSync(profileDir, { recursive: true });
        }

        const prefsPath = path.join(profileDir, 'Preferences');
        const prefs = {
            "intl": {
                "accept_languages": "en-US,en",
                "selected_languages": "en-US,en"
            },
            "translate": {
                "enabled": false
            },
            "translate_site_blacklist": ["twitter.com"],
            "browser": {
                "enabled_labs_experiments": ["disable-auto-translate"],
                "check_default_browser": false
            },
            "profile": {
                "content_settings": {
                    "exceptions": {
                        "translate_site_blacklist": {
                            "twitter.com,*": {
                                "setting": 1
                            }
                        }
                    }
                }
            }
        };

        fs.writeFileSync(prefsPath, JSON.stringify(prefs));
        return profileDir;
    }

    async init() {
        const profileDir = await this.createChromePrefs();
        
        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1280, height: 800 },
            args: [
                `--user-data-dir=${profileDir}`,
                '--lang=en-US',
                '--no-sandbox',
                '--disable-translate',
                '--disable-translate-script-url',
                '--disable-sync',
                '--disable-auto-translate',
                '--disable-client-side-phishing-detection'
            ]
        });

        this.page = await this.browser.newPage();
        
        // Set language preferences
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });

        // Override language settings
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'language', {
                get: function() { return 'en-US'; }
            });
            Object.defineProperty(navigator, 'languages', {
                get: function() { return ['en-US', 'en']; }
            });
        });
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async login() {
        try {
            console.log(`${this.personality.name}: Starting login process...`);
            
            // Navigate to Twitter login
            await this.page.goto('https://twitter.com/i/flow/login', {
                waitUntil: 'networkidle0'
            });
            console.log(`${this.personality.name}: Loaded login page`);
            
            await this.delay(3000);

            // Type username
            console.log(`${this.personality.name}: Looking for username field...`);
            const usernameField = await this.page.waitForSelector('input[autocomplete="username"]', { visible: true });
            await usernameField.type(this.username, { delay: 100 });
            console.log(`${this.personality.name}: Entered username`);
            
            await this.delay(1000);

            // Updated Next button click logic with more precise targeting
            console.log(`${this.personality.name}: Looking for Next button...`);
            
            // Wait for any potential loading states to complete
            await this.delay(2000);

            // Find and click the Next button using a more reliable method
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
            await this.delay(2000);

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
            
            await this.delay(1000);

            // Updated login button click logic with more precise targeting
            console.log(`${this.personality.name}: Looking for login button...`);
            
            // Wait for any potential loading states to complete
            await this.delay(2000);

            // Find and click the Login button using the same reliable method
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

            // Wait for navigation to complete
            await this.delay(5000);
            
            console.log(`${this.personality.name}: Login completed successfully`);
        } catch (error) {
            console.error(`Login failed for ${this.personality.name}:`, error);
            // Take a screenshot when login fails
            try {
                const errorPath = path.join(__dirname, 'errors', `login-error-${Date.now()}.png`);
                await this.page.screenshot({ path: errorPath });
                console.log(`${this.personality.name}: Saved error screenshot to ${errorPath}`);
            } catch (screenshotError) {
                console.error('Failed to save error screenshot:', screenshotError);
            }
            throw error;
        }
    }

    async generateTweet(maxAttempts = 3) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const completion = await this.openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: this.personality.prompt + "\nIMPORTANT: Your response MUST be under 280 characters. If you exceed this limit, your tweet will be rejected."
                        },
                        {
                            role: "user",
                            content: "Generate a single tweet (max 280 characters) about your current thoughts or activities. Be concise and impactful."
                        }
                    ],
                    max_tokens: 100,
                    temperature: 0.8
                });

                const tweet = completion.choices[0].message.content;
                
                // Check if tweet is within character limit
                if (tweet.length <= 280) {
                    console.log(`${this.personality.name}: Generated valid tweet (${tweet.length} characters)`);
                    return tweet;
                }
                
                console.log(`${this.personality.name}: Generated tweet exceeded character limit (${tweet.length}/280), attempt ${attempt}/${maxAttempts}`);
                
                if (attempt === maxAttempts) {
                    // On final attempt, truncate the tweet to fit
                    const truncatedTweet = tweet.slice(0, 277) + "...";
                    console.log(`${this.personality.name}: Truncated tweet to fit character limit`);
                    return truncatedTweet;
                }
            } catch (error) {
                console.error(`Tweet generation failed for ${this.personality.name} (attempt ${attempt}/${maxAttempts}):`, error);
                if (attempt === maxAttempts) throw error;
            }
        }
    }

    async postTweet(tweet) {
        try {
            await this.delay(2000);
    
            const composeSelector = 'a[data-testid="SideNav_NewTweet_Button"]';
            await this.page.waitForSelector(composeSelector, { visible: true });
            await this.page.click(composeSelector);
            await this.delay(1500);
    
            const textareaSelector = 'div[data-testid="tweetTextarea_0"]';
            await this.page.waitForSelector(textareaSelector, { visible: true });
            await this.page.click(textareaSelector);
            await this.page.keyboard.type(tweet, { delay: 50 });
            await this.delay(1000);
    
            const postButtonSelector = '[data-testid="tweetButton"]';
            await this.page.waitForSelector(postButtonSelector, { visible: true });
            await this.page.click(postButtonSelector);
            
            // Simple delay to allow post to complete
            await this.delay(5000);
    
            console.log(`${this.personality.name} successfully tweeted: ${tweet}`);
            await this.delay(2000);
        } catch (error) {
            console.error(`Posting tweet failed for ${this.personality.name}:`, error);
            await this.takeErrorScreenshot('post-error');
            throw error;
        }
    }

    async logout() {
        try {
            // Click account menu
            await this.page.waitForSelector('[data-testid="Account"]', { visible: true });
            await this.page.click('[data-testid="Account"]');
            await this.delay(1000);

            // Click Log out
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

            // Confirm logout
            await this.delay(1000);
            const confirmButtons = await this.page.$$('[role="button"]');
            let confirmFound = false;

            for (const button of confirmButtons) {
                const buttonText = await this.page.evaluate(el => el.textContent, button);
                if (buttonText.toLowerCase().includes('log out')) {
                    await button.click();
                    confirmFound = true;
                    break;
                }
            }

            if (!confirmFound) {
                throw new Error('Could not find Logout confirmation button');
            }

            await this.delay(2000);
            console.log(`${this.personality.name}: Successfully logged out`);
        } catch (error) {
            console.error(`Logout failed for ${this.personality.name}:`, error);
            await this.takeErrorScreenshot('logout-error');
            throw error;
        }
    }

    async takeErrorScreenshot(prefix) {
        try {
            const errorPath = path.join(__dirname, 'errors', `${prefix}-${Date.now()}.png`);
            await this.page.screenshot({ path: errorPath, fullPage: true });
            console.log(`${this.personality.name}: Saved error screenshot to ${errorPath}`);
        } catch (screenshotError) {
            console.error('Failed to save error screenshot:', screenshotError);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async run() {
        try {
            await this.init();
            await this.login();
            const tweet = await this.generateTweet();
            await this.postTweet(tweet);
            await this.logout();
            await this.close();
        } catch (error) {
            console.error(`Bot run failed for ${this.personality.name}:`, error);
            if (this.browser) {
                await this.browser.close();
            }
            throw error;
        }
    }
}

module.exports = TwitterBot;
