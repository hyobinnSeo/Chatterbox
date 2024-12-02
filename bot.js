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
                await this.page.screenshot({ path: `login-error-${Date.now()}.png` });
                console.log(`${this.personality.name}: Saved error screenshot`);
            } catch (screenshotError) {
                console.error('Failed to save error screenshot:', screenshotError);
            }
            throw error;
        }
    }

    async generateTweet() {
        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: this.personality.prompt
                    },
                    {
                        role: "user",
                        content: "Generate a single tweet (max 280 characters) about your current thoughts or activities."
                    }
                ],
                max_tokens: 100,
                temperature: 0.8
            });

            return completion.choices[0].message.content;
        } catch (error) {
            console.error(`Tweet generation failed for ${this.personality.name}:`, error);
            throw error;
        }
    }

    async postTweet(tweet) {
        try {
            // Wait for the home page to load
            await this.delay(2000);

            // Click compose tweet button (Post button)
            const composeButton = await this.page.waitForSelector('a[href="/compose/tweet"]');
            await composeButton.click();
            await this.delay(2000);

            // Type tweet
            const tweetTextarea = await this.page.waitForSelector('div[data-testid="tweetTextarea_0"]');
            await tweetTextarea.type(tweet, { delay: 50 });
            await this.delay(1000);

            // Click Post button
            const postButton = await this.page.waitForSelector('div[data-testid="tweetButton"]');
            await postButton.click();
            await this.delay(2000);

            console.log(`${this.personality.name} successfully tweeted: ${tweet}`);
        } catch (error) {
            console.error(`Posting tweet failed for ${this.personality.name}:`, error);
            throw error;
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
        } catch (error) {
            console.error(`Bot run failed for ${this.personality.name}:`, error);
            if (this.browser) {
                await this.browser.close();
            }
            throw error; // Re-throw the error to be handled by the caller
        }
    }
}

module.exports = TwitterBot;
