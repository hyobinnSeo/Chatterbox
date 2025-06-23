const Utilities = require('../utils/Utilities');
const TweetContentExtractor = require('../utils/TweetContentExtractor');
const TweetTextProcessor = require('../utils/TweetTextProcessor');
const GeminiApiClient = require('../utils/GeminiApiClient');

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
                // Helper function to extract complete text including @mentions - defined inside evaluate
                function extractFullTweetContent(element) {
                    if (!element) return '';
                    
                    // Try multiple approaches to extract complete text including @mentions
                    let text = '';
                    
                    // Method 1: Use innerText which preserves more content than textContent
                    if (element.innerText) {
                        text = element.innerText;
                    } else if (element.textContent) {
                        text = element.textContent;
                    }
                    
                    // Method 2: If still missing @mentions, try walking through child nodes
                    if (text && !text.includes('@')) {
                        const walker = document.createTreeWalker(
                            element,
                            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
                            {
                                acceptNode: function(node) {
                                    // Accept text nodes and link elements (which might contain @mentions)
                                    if (node.nodeType === Node.TEXT_NODE ||
                                        (node.nodeType === Node.ELEMENT_NODE && 
                                         (node.tagName === 'A' || node.tagName === 'SPAN'))) {
                                        return NodeFilter.FILTER_ACCEPT;
                                    }
                                    return NodeFilter.FILTER_SKIP;
                                }
                            }
                        );
                        
                        let fullText = '';
                        let node;
                        while (node = walker.nextNode()) {
                            if (node.nodeType === Node.TEXT_NODE) {
                                fullText += node.textContent;
                            } else if (node.nodeType === Node.ELEMENT_NODE) {
                                // Check if this element contains @mention
                                const href = node.getAttribute('href');
                                if (href && href.includes('/')) {
                                    const linkText = node.textContent;
                                    if (linkText.startsWith('@') || href.includes('/@')) {
                                        fullText += linkText.startsWith('@') ? linkText : '@' + linkText;
                                    } else {
                                        fullText += linkText;
                                    }
                                } else {
                                    fullText += node.textContent;
                                }
                            }
                        }
                        
                        if (fullText.trim()) {
                            text = fullText;
                        }
                    }
                    
                    // Method 3: Alternative approach - check for links that might be @mentions
                    if (!text.includes('@')) {
                        const links = element.querySelectorAll('a[href*="/@"], a[href*="/"], span[dir="ltr"]');
                        let reconstructedText = element.textContent || '';
                        
                        for (const link of links) {
                            const href = link.getAttribute('href');
                            const linkText = link.textContent;
                            
                            if (href && href.includes('/@') && !linkText.startsWith('@')) {
                                // This is likely a @mention link  
                                const username = href.split('/@')[1];
                                if (username) {
                                    reconstructedText = reconstructedText.replace(linkText, '@' + username);
                                }
                            }
                        }
                        
                        if (reconstructedText !== (element.textContent || '')) {
                            text = reconstructedText;
                        }
                    }
                    
                    return text.trim();
                }

                const tweets = [];
                let attempts = 0;
                const maxAttempts = 5;

                while (tweets.length < 10 && attempts < maxAttempts) {
                    const tweetElements = document.querySelectorAll('[data-testid="tweet"]');

                    for (const tweet of tweetElements) {
                        const nicknameElement = tweet.querySelector('[data-testid="User-Name"]');
                        const contentElement = tweet.querySelector('[data-testid="tweetText"]');

                        if (nicknameElement && contentElement) {
                            // Enhanced tweet content extraction including @mentions
                            let tweetContent = extractFullTweetContent(contentElement);
                            
                            // Try multiple approaches to find quoted tweets
                            const allTweetTexts = tweet.querySelectorAll('[data-testid="tweetText"]');
                            if (allTweetTexts.length > 1) {
                                // If there are multiple tweetText elements, the second one is likely the quoted tweet
                                for (let i = 1; i < allTweetTexts.length; i++) {
                                    const additionalText = extractFullTweetContent(allTweetTexts[i]);
                                    if (additionalText && additionalText !== tweetContent && !tweetContent.includes(additionalText)) {
                                        tweetContent += `\n\n[Quoted tweet from someone else] ${additionalText}`;
                                    }
                                }
                            }
                            
                            // Also try looking for any nested article elements which might contain quoted content
                            const nestedArticles = tweet.querySelectorAll('article');
                            if (nestedArticles.length > 1) {
                                for (let i = 1; i < nestedArticles.length; i++) {
                                    const nestedText = nestedArticles[i].querySelector('[data-testid="tweetText"]');
                                    if (nestedText) {
                                        const quotedContent = extractFullTweetContent(nestedText);
                                        if (quotedContent && quotedContent !== tweetContent && !tweetContent.includes(quotedContent)) {
                                            tweetContent += `\n\n[Quoted tweet from someone else] ${quotedContent}`;
                                        }
                                    }
                                }
                            }

                            const tweetData = {
                                nickname: nicknameElement.textContent,
                                content: tweetContent
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
                "\nIMPORTANT: Your response MUST be under 280 bytes. If you exceed this limit, your tweet will be truncated." +
                "\nIMPORTANT: 트윗은 한국어로 작성하세요. (하게체나 하오체를 사용하지 마세요.)" +
                "\nIMPORTANT: Quotes나 예시 문장들은 문장의 스타일과 톤을 참고하는 용도로만 활용하고 그것을 재사용하거나 똑같이 반복하지 마세요.";

            const userPrompt = "Generate a single tweet while maintaining your historical persona. Be concise and impactful.";

            const tweet = await GeminiApiClient.generateContent(systemPrompt, userPrompt, this.personality.name);
            const cleanedTweet = TweetTextProcessor.cleanupTweet(tweet);

            // Log the tweet length info
            if (cleanedTweet.length > 280) {
                console.log(`${this.personality.name}: Original tweet exceeded 280 characters (${cleanedTweet.length})`);
                console.log(`${this.personality.name}: Tweet truncated to ${cleanedTweet.length} characters`);
            } else {
                console.log(`${this.personality.name}: Generated tweet (${cleanedTweet.length} characters)`);
            }

            return cleanedTweet;
        } catch (error) {
            console.error(`Tweet generation failed for ${this.personality.name}:`, error);
            throw error;
        }
    }

    async postTweet(tweet) {
        try {
            tweet = TweetTextProcessor.cleanupTweet(tweet);

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
