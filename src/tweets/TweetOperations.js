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
    
            // Wait for and click the Following tab
            await this.page.waitForSelector('[role="tab"]');
            const followingTab = await this.page.$('a[href="/home"][role="tab"]:not([aria-selected="true"])');
            if (followingTab) {
                await followingTab.click();
                console.log(`${this.personality.name}: Switched to Following tab`);
            } else {
                throw new Error('Could not find Following tab');
            }
    
            await Utilities.delay(3000);
    
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
                tweetContext = "\n\nRecent tweets from your timeline:\n" +
                    this.recentTweets.map(tweet =>
                        `${tweet.nickname}: ${tweet.content}`
                    ).join('\n') +
                    "\n\nConsider these recent tweets and react to them in your response while staying in character.";
            }

            const systemPrompt = this.personality.prompt + '\n' + this.personality.name + '\n' + this.personality.title + '\n' + this.personality.years + '\n' + this.personality.characteristics + '\n' + this.personality.trivia + '\n' + this.personality.guidelines + '\n' + tweetContext + 
                "\nIMPORTANT: Don't use @ to tag anyone, and no hashtags in your tweet. Simply write the tweet content." + "\nIMPORTANT: Your response MUST be under 280 characters. If you exceed this limit, your tweet will be truncated.";
            const userPrompt = "Generate a single tweet (max 280 characters) reacting to the recent tweets while maintaining your historical persona. Be concise and impactful.";

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

            // Clean up the tweet and ensure it's within limits
            tweet = tweet.trim();
            
            // Remove any quotes that might have been added by the AI
            if (tweet.startsWith('"') && tweet.endsWith('"')) {
                tweet = tweet.slice(1, -1).trim();
            }

            // Enforce the 280 character limit
            const MAX_TWEET_LENGTH = 280;
            if (tweet.length > MAX_TWEET_LENGTH) {
                console.log(`${this.personality.name}: Original tweet exceeded ${MAX_TWEET_LENGTH} characters (${tweet.length})`);
                tweet = tweet.slice(0, MAX_TWEET_LENGTH - 3) + "...";
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
            // Final length check before posting
            if (tweet.length > 280) {
                tweet = tweet.slice(0, 277) + "...";
                console.log(`${this.personality.name}: Final tweet length check - truncated to ${tweet.length} characters`);
            }

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
}

module.exports = TweetOperations;
