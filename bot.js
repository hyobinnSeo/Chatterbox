const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class TwitterBot {
    constructor(credentials, personality) {
        this.username = credentials.username;
        this.password = credentials.password;
        this.personality = personality;
        this.browser = null;
        this.page = null;
        this.recentTweets = [];
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
                get: function () { return 'en-US'; }
            });
            Object.defineProperty(navigator, 'languages', {
                get: function () { return ['en-US', 'en']; }
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

    async readFollowingTweets() {
        try {
            console.log(`${this.personality.name}: Reading tweets from Following tab...`);
    
            // Updated selectors without :has-text
            const followingTabSelectors = [
                'a[href="/home"][aria-label*="Following"]',
                '[data-testid="AppTabBar_Home_Link"]',
                '[aria-label="Timeline: Following"]',
                '[role="tab"][aria-selected="false"]'
            ];
    
            let followingTab = null;
            for (const selector of followingTabSelectors) {
                followingTab = await this.page.$(selector);
                if (followingTab) {
                    await followingTab.click();
                    break;
                }
            }
    
            if (!followingTab) {
                const followingTabByText = await this.page.$x("//span[contains(text(), 'Following')]");
                if (followingTabByText.length > 0) {
                    await followingTabByText[0].click();
                } else {
                    throw new Error('Could not find Following tab');
                }
            }
    
            await this.delay(3000);
    
            // Updated tweet reading logic with scroll and retry
            const tweets = await this.page.evaluate(async () => {
                const tweets = [];
                let attempts = 0;
                const maxAttempts = 5;
                
                while (tweets.length < 10 && attempts < maxAttempts) {
                    const tweetElements = document.querySelectorAll('[data-testid="tweet"]');
                    
                    for (const tweet of tweetElements) {
                        const nicknameElement = tweet.querySelector('[data-testid="User-Name"]');
                        const contentElement = tweet.querySelector('[data-testid="tweetText"]');
                        
                        if (nicknameElement && contentElement) {
                            const tweetData = {
                                nickname: nicknameElement.textContent.trim(),
                                content: contentElement.textContent.trim()
                            };
                            
                            // Check if tweet is already in array
                            if (!tweets.some(t => t.nickname === tweetData.nickname && t.content === tweetData.content)) {
                                tweets.push(tweetData);
                                if (tweets.length >= 10) break;
                            }
                        }
                    }
                    
                    if (tweets.length < 10) {
                        window.scrollBy(0, 500);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                    attempts++;
                }
                
                return tweets;
            });
    
            this.recentTweets = tweets;
            console.log(`${this.personality.name}: Read ${tweets.length} tweets from timeline`);
        } catch (error) {
            console.error(`Reading tweets failed for ${this.personality.name}:`, error);
            await this.takeErrorScreenshot('read-tweets-error');
            throw error;
        }
    }

    async generateTweet(maxAttempts = 3) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Create context from recent tweets
                let tweetContext = "";
                if (this.recentTweets.length > 0) {
                    tweetContext = "\n\nRecent tweets from your timeline:\n" +
                        this.recentTweets.map(tweet =>
                            `${tweet.nickname}: ${tweet.content}`
                        ).join('\n') +
                        "\n\nConsider these recent tweets and react to them in your response while staying in character.";
                }

                // Construct the complete prompt
                const systemPrompt = this.personality.prompt + tweetContext + "\nIMPORTANT: Your response MUST be under 280 characters. If you exceed this limit, your tweet will be rejected.";
                const userPrompt = "Generate a single tweet (max 280 characters) reacting to the recent tweets while maintaining your historical persona. Be concise and impactful.";

                // Print the complete prompt to console
                console.log('\nComplete prompt being sent to OpenRouter:');
                console.log('System message:', systemPrompt);
                console.log('User message:', userPrompt);

                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'HTTP-Referer': 'http://localhost:3000',
                        'X-Title': 'Twitter Bot'
                    },
                    body: JSON.stringify({
                        model: "google/gemini-pro-1.5",
                        messages: [
                            {
                                role: "system",
                                content: systemPrompt
                            },
                            {
                                role: "user",
                                content: userPrompt
                            }
                        ]
                    })
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const tweet = data.choices[0].message.content;

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

            // Click compose tweet button to ensure modal appears
            const composeSelector = '[data-testid="tweetButtonInline"],[data-testid="SideNav_NewTweet_Button"]';
            const composeButton = await this.page.waitForSelector(composeSelector);
            await composeButton.click();
            await this.delay(1500);

            // Verify we're in the compose modal by checking backdrop
            const modalSelector = '[aria-modal="true"]';
            await this.page.waitForSelector(modalSelector);

            // Type the tweet
            const textareaSelector = '[data-testid="tweetTextarea_0"]';
            const textarea = await this.page.waitForSelector(textareaSelector);
            await textarea.click();
            await this.page.keyboard.type(tweet, { delay: 50 });
            await this.delay(1000);

            // Updated post button click logic with retry
            const postButtonSelector = '[data-testid="tweetButton"]';
            await this.page.waitForSelector(postButtonSelector, { visible: true });
            const postButton = await this.page.$(postButtonSelector);

            if (!postButton) {
                throw new Error('Post button not found');
            }

            // Force click with JavaScript
            await this.page.evaluate(button => button.click(), postButton);

            // Fallback to regular click if needed
            if (!await this.page.evaluate(() => document.querySelector('[data-testid="tweetButton"]'))) {
                await postButton.click();
            }

            // Handle popups
            await this.delay(2000);
            try {
                const popup = await this.page.$('[role="dialog"]');
                if (popup) {
                    const gotItButton = await this.page.$('text/Got it');
                    if (gotItButton) await gotItButton.click();
                    const viewButton = await this.page.$('text/View');
                    if (viewButton) await viewButton.click();
                }
            } catch (popupError) {
                console.log('No popup found, continuing...');
            }

            await this.delay(3000);
            console.log(`${this.personality.name} successfully tweeted: ${tweet}`);
        } catch (error) {
            console.error(`Posting tweet failed for ${this.personality.name}:`, error);
            await this.takeErrorScreenshot('post-error');
            throw error;
        }
    }

    async logout() {
        try {
            await this.delay(3000);

            const sidebarAccountSelector = '[data-testid="SideNav_AccountSwitcher_Button"]';
            await this.page.waitForSelector(sidebarAccountSelector, { visible: true });
            await this.page.click(sidebarAccountSelector);
            await this.delay(1500);

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
            await this.delay(1500);
            const logoutButton = await this.page.waitForSelector('[data-testid="confirmationSheetConfirm"]');
            await logoutButton.click();

            await this.delay(3000);
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
            await this.readFollowingTweets();
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
