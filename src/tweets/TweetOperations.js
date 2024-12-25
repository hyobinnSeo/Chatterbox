const Utilities = require('../utils/Utilities');

class TweetOperations {
    constructor(page, personality, errorHandler) {
        this.page = page;
        this.personality = personality;
        this.errorHandler = errorHandler;
        this.recentTweets = [];
    }

    async readFollowingTweets() {
        try {
            console.log(`${this.personality.name}: Reading tweets from Following tab...`);

            // First ensure we're on the home page
            const homeSelector = '[data-testid="AppTabBar_Home_Link"]';
            await this.page.waitForSelector(homeSelector);
            await this.page.click(homeSelector);
            await Utilities.delay(2000);

            // Wait for and find the Following tab with more specific selectors
            await this.page.waitForSelector('[role="tab"]', { timeout: 5000 });

            // Try multiple possible selectors for the Following tab
            const followingTab = await this.page.evaluate(() => {
                // Try different ways to find the Following tab
                const selectors = [
                    'a[href="/home"][role="tab"]:not([aria-selected="true"])',
                    '[role="tab"]:not([aria-selected="true"])',
                    '[data-testid="pivot.following"]',
                    'a[href="/home"]:has-text("Following")',
                    '[role="tab"]:has-text("Following")'
                ];

                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        return true;
                    }
                }
                return false;
            });

            if (followingTab) {
                // Click the Following tab using the most reliable selector
                await this.page.evaluate(() => {
                    const selectors = [
                        'a[href="/home"][role="tab"]:not([aria-selected="true"])',
                        '[role="tab"]:not([aria-selected="true"])',
                        '[data-testid="pivot.following"]',
                        'a[href="/home"]:has-text("Following")',
                        '[role="tab"]:has-text("Following")'
                    ];

                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            element.click();
                            return;
                        }
                    }
                });

                console.log(`${this.personality.name}: Switched to Following tab`);
            } else {
                console.log(`${this.personality.name}: Following tab not found, assuming already on Following view`);
            }

            await Utilities.delay(3000);

            // Read tweets from timeline
            this.recentTweets = await this.page.evaluate(async () => {
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
                                nickname: nicknameElement.textContent,
                                content: contentElement.textContent
                            };

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

            console.log(`${this.personality.name}: Read ${this.recentTweets.length} tweets from timeline`);
        } catch (error) {
            await this.errorHandler.handleError(error, 'Reading tweets');
        }
    }

    async generateTweet() {
        try {
            let tweetContext = "";
            if (this.recentTweets.length > 0) {
                tweetContext = "\n\nRecent tweets from your feed:\n" +
                    this.recentTweets.map(tweet =>
                        `${tweet.nickname}: ${tweet.content}`
                    ).join('\n') +
                    "\n\nConsider these recent tweets.";
            }

            const systemPrompt = this.personality.prompt + '\n' +
                this.personality.name + '\n' +
                this.personality.title + '\n' +
                this.personality.years + '\n' +
                this.personality.characteristics + '\n' +
                this.personality.relationships + '\n' +
                this.personality.quotes + '\n' +
                this.personality.guidelines + '\n' +
                tweetContext +
                "\nIMPORTANT: If the timeline's subject matter is becoming repetitive (everyone is discussing the same thing), avoid that topic and talk about something else." +
                "\nIMPORTANT: Don't use @, hashtags, or emojis. Simply write the tweet content." +
                "\nIMPORTANT: Your response MUST be under 280 characters. If you exceed this limit, your tweet will be truncated.";

            const userPrompt = "Generate a single tweet while maintaining your historical persona. Be concise and impactful.";

            console.log('\nComplete prompt being sent to OpenRouter:');
            console.log('System message:', systemPrompt);
            console.log('User message:', userPrompt);

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://chatterbox.local',
                    'X-Title': 'Chatterbox'
                },
                body: JSON.stringify({
                    model: "google/gemini-pro-1.5",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userPrompt }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            let tweet = data.choices[0]?.message?.content;

            if (!tweet) {
                throw new Error('No response content received from OpenRouter');
            }

            tweet = this.cleanupTweet(tweet);

            // Log the tweet length info
            if (tweet.length > 280) {
                console.log(`${this.personality.name}: Original tweet exceeded 280 characters (${tweet.length})`);
                console.log(`${this.personality.name}: Tweet truncated to ${tweet.length} characters`);
            } else {
                console.log(`${this.personality.name}: Generated tweet (${tweet.length} characters)`);
            }

            return tweet;
        } catch (error) {
            console.error(`Tweet generation failed for ${this.personality.name}:`, error);
            throw error;
        }
    }

    async postTweet(tweet) {
        try {
            tweet = this.cleanupTweet(tweet);

            await Utilities.delay(2000);

            const composeSelector = '[data-testid="tweetButtonInline"],[data-testid="SideNav_NewTweet_Button"]';
            const composeButton = await this.page.waitForSelector(composeSelector);
            await composeButton.click();
            await Utilities.delay(1500);

            const modalSelector = '[aria-modal="true"]';
            await this.page.waitForSelector(modalSelector);

            const textareaSelector = '[data-testid="tweetTextarea_0"]';
            const textarea = await this.page.waitForSelector(textareaSelector);
            await textarea.click();
            await this.page.keyboard.type(tweet, { delay: 50 });
            await Utilities.delay(1000);

            const postButtonSelector = '[data-testid="tweetButton"]';
            await this.page.waitForSelector(postButtonSelector, { visible: true });
            const postButton = await this.page.$(postButtonSelector);

            if (!postButton) {
                throw new Error('Post button not found');
            }

            await this.page.evaluate(button => button.click(), postButton);

            if (!await this.page.evaluate(() => document.querySelector('[data-testid="tweetButton"]'))) {
                await postButton.click();
            }

            await Utilities.delay(2000);
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

            await Utilities.delay(3000);
            console.log(`${this.personality.name} successfully tweeted: ${tweet}`);
        } catch (error) {
            await this.errorHandler.handleError(error, 'Posting tweet');
        }
    }

    cleanupTweet(tweet) {
        // Remove any quotes that might have been added by the AI
        if (tweet.startsWith('"') && tweet.endsWith('"')) {
            tweet = tweet.slice(1, -1).trim();
        }

        // Remove hashtags
        tweet = tweet.replace(/#\w+/g, '');

        // Remove @ mentions
        tweet = tweet.replace(/@\w+/g, '');

        // Clean up any double spaces created by removals
        tweet = tweet.replace(/\s+/g, ' ').trim();

        // Enforce character limit
        if (tweet.length > 280) {
            tweet = tweet.slice(0, 277) + "...";
        }

        return tweet;
    }
}

module.exports = TweetOperations;
