const Utilities = require('../utils/Utilities');

class ReplyOperations {
    constructor(page, personality, errorHandler, currentUsername, allBotUsernames) {
        this.page = page;
        this.personality = personality;
        this.errorHandler = errorHandler;
        this.currentUsername = currentUsername;
        this.allBotUsernames = allBotUsernames;
    }

    async generateReply(threadContext, isBot = false, isFromNotification = false) {
        // Convert thread context to string format
        let threadPrompt = threadContext.map(tweet =>
            `${tweet.username}: ${tweet.content}`
        ).join('\n');

        // If thread prompt exceeds 10,000 characters, truncate from the start
        // keeping the most recent context
        if (threadPrompt.length > 10000) {
            const tweets = threadPrompt.split('\n');
            threadPrompt = '';
            for (let i = tweets.length - 1; i >= 0; i--) {
                const newPrompt = tweets[i] + '\n' + threadPrompt;
                if (newPrompt.length > 10000) break;
                threadPrompt = newPrompt;
            }
            threadPrompt = threadPrompt.trim();
        }

        // Use appropriate prompt based on whether we're replying to a bot or user
        const promptToUse = isBot ? this.personality.reply_to_bot_prompt : this.personality.reply_to_user_prompt;

        const systemPrompt = promptToUse + '\n' +
            this.personality.name + '\n' +
            this.personality.title + '\n' +
            this.personality.years + '\n' +
            this.personality.characteristics + '\n' +
            this.personality.relationships + '\n' +
            this.personality.quotes + '\n' +
            this.personality.guidelines + '\n' +
            `Thread context:\n${threadPrompt}\n` +
            "IMPORTANT: Keep your reply under 280 characters. Don't use @, hashtags, or emojis. Simply write the tweet content.";

        // Different user prompts based on context and whether target is bot or user
        let userPrompt;
        if (isFromNotification) {
            userPrompt = isBot 
                ? "Generate a reply to this user's tweet. Consider the entire conversation thread for context. Be concise and relevant."
                : "Generate a reply to Belle's tweet. Consider the entire conversation thread for context. Be concise and relevant.";
        } else {
            userPrompt = isBot
                ? "Generate a comment to this user's tweet you found while browsing the timeline. You're choosing to engage with this user's tweet among many others you've seen, so make your response meaningful while maintaining your historical persona. Consider the entire conversation thread for context. Be concise and relevant."
                : "Generate a comment to Belle's tweet you found while browsing the timeline. You're choosing to engage with her tweet among many others you've seen, so make your response meaningful while maintaining your historical persona. Consider the entire conversation thread for context. Be concise and relevant.";
        }

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
        let reply = data.choices[0]?.message?.content;

        if (!reply) {
            throw new Error('No response content received from OpenRouter');
        }

        return this.cleanupTweet(reply);
    }

    async processAndReplyToTweet(tweetData, targetUsername, isFromNotification = false) {
        // Navigate to the specific tweet
        await this.page.evaluate(tweetUrl => {
            window.location.href = tweetUrl;
        }, tweetData.tweetUrl);

        await Utilities.delay(3000);

        // Get thread context
        const threadContext = await this.getThreadContext();

        // Find and click reply on the target tweet
        await this.page.evaluate((targetContent) => {
            const tweets = document.querySelectorAll('[data-testid="tweet"]');
            for (const tweet of tweets) {
                const contentElement = tweet.querySelector('[data-testid="tweetText"]');
                if (contentElement && contentElement.textContent === targetContent) {
                    const replyButton = tweet.querySelector('[data-testid="reply"]');
                    if (replyButton) {
                        replyButton.click();
                        return;
                    }
                }
            }
        }, tweetData.content);

        await Utilities.delay(2000);

        // Check if we're replying to another bot
        const isBot = this.allBotUsernames.some(botUsername => targetUsername.includes(botUsername));
        const reply = await this.generateReply(threadContext, isBot, isFromNotification);
        await this.postReply(reply, targetUsername);
    }

    async replyToBotTweets() {
        try {
            console.log(`${this.personality.name}: Looking for other bot tweets to reply to...`);
    
            // Filter out current bot's username
            const otherBotUsernames = this.allBotUsernames.filter(username => username !== this.currentUsername);
    
            // First ensure we're on the home page and Following tab
            const homeSelector = '[data-testid="AppTabBar_Home_Link"]';
            await this.page.waitForSelector(homeSelector);
            await this.page.click(homeSelector);
            await Utilities.delay(2000);

            // Get tweets from timeline
            const timelineTweets = await this.page.evaluate(async (otherBotUsernames) => {
                const tweets = [];
                let attempts = 0;
                const maxAttempts = 5;

                while (tweets.length < 10 && attempts < maxAttempts) {
                    const tweetElements = document.querySelectorAll('[data-testid="tweet"]');

                    for (const tweet of tweetElements) {
                        try {
                            const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                            const contentElement = tweet.querySelector('[data-testid="tweetText"]');
                            const timeElement = tweet.querySelector('time');
                            
                            // Add null checks for all elements
                            if (!usernameElement || !contentElement || !timeElement) {
                                continue;
                            }

                            const timeLink = timeElement.parentElement;
                            if (!timeLink) {
                                continue;
                            }

                            const tweetUrl = timeLink.getAttribute('href');
                            if (!tweetUrl) {
                                continue;
                            }

                            const username = usernameElement.textContent;
                            // Check if this tweet is from one of our other bots
                            if (otherBotUsernames.some(botUsername => username.includes(botUsername))) {
                                tweets.push({
                                    username: username,
                                    content: contentElement.textContent,
                                    tweetUrl
                                });
                                if (tweets.length >= 10) break;
                            }
                        } catch (err) {
                            console.error('Error processing tweet:', err);
                            continue;
                        }
                    }

                    if (tweets.length < 10) {
                        window.scrollBy(0, 500);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    attempts++;
                }

                return tweets;
            }, otherBotUsernames);

            console.log(`${this.personality.name}: Found ${timelineTweets.length} tweets from other bots`);

            // Process each bot tweet
            for (const tweetData of timelineTweets) {
                const hasReplied = await this.checkIfAlreadyReplied(tweetData);
                if (!hasReplied) {
                    await this.processAndReplyToTweet(tweetData, tweetData.username, false);
                    break; // Only reply to one tweet per run to avoid spamming
                } else {
                    console.log(`${this.personality.name}: Already replied to bot tweet, skipping...`);
                }
            }

            await this.returnToHome();

        } catch (error) {
            await this.returnToHome();
            await this.errorHandler.handleError(error, 'Replying to bot tweets');
        }
    }

    async replyToSpecificUserFromNotifications(targetUsername) {
        try {
            console.log(`${this.personality.name}: Checking notifications for tweets from @${targetUsername}...`);
    
            // Navigate to notifications
            const notificationSelector = '[data-testid="AppTabBar_Notifications_Link"]';
            await this.page.waitForSelector(notificationSelector);
            await this.page.click(notificationSelector);
            await Utilities.delay(3000);
    
            let hasMoreTweetsToProcess = true;
            let processedTweets = new Set(); // Keep track of processed tweets
    
            while (hasMoreTweetsToProcess) {
                // Find all tweets and store their data
                const targetTweetsData = await this.page.evaluate((username, processedUrls) => {
                    const notifications = document.querySelectorAll('[data-testid="tweet"]');
                    const tweets = [];
    
                    for (const notification of notifications) {
                        const usernameElement = notification.querySelector('[data-testid="User-Name"]');
                        if (usernameElement && usernameElement.textContent.includes(`@${username}`)) {
                            const contentElement = notification.querySelector('[data-testid="tweetText"]');
    
                            if (contentElement) {
                                const timeLink = notification.querySelector('time').parentElement;
                                const tweetUrl = timeLink ? timeLink.getAttribute('href') : null;
    
                                // Only add if we haven't processed this tweet before
                                if (tweetUrl && !processedUrls.includes(tweetUrl)) {
                                    tweets.push({
                                        content: contentElement.textContent,
                                        tweetUrl,
                                    });
                                }
                            }
                        }
                    }
                    return tweets;
                }, targetUsername, Array.from(processedTweets));
    
                if (targetTweetsData.length === 0) {
                    console.log(`${this.personality.name}: No more notifications found from @${targetUsername}`);
                    hasMoreTweetsToProcess = false;
                    continue;
                }
    
                // Process each found tweet
                for (const tweetData of targetTweetsData) {
                    if (processedTweets.has(tweetData.tweetUrl)) {
                        continue;
                    }
    
                    // Check if we've already replied using checkIfAlreadyReplied
                    const hasReplied = await this.checkIfAlreadyReplied(tweetData);
                    if (!hasReplied) {
                        await this.processAndReplyToTweet(tweetData, targetUsername, true);
                    } else {
                        console.log(`${this.personality.name}: Already replied to notification, skipping...`);
                    }
    
                    // Mark this tweet as processed
                    processedTweets.add(tweetData.tweetUrl);
    
                    // Navigate back to notifications
                    await this.page.click(notificationSelector);
                    await Utilities.delay(3000);
                }
            }
    
            await this.returnToHome();
    
        } catch (error) {
            await this.returnToHome();
            await this.errorHandler.handleError(error, 'Replying to notification');
        }
    }

    async replyToBotNotifications() {
        try {
            console.log(`${this.personality.name}: Checking notifications for bot replies...`);
            
            // Navigate to notifications
            const notificationSelector = '[data-testid="AppTabBar_Notifications_Link"]';
            await this.page.waitForSelector(notificationSelector);
            await this.page.click(notificationSelector);
            await Utilities.delay(3000);
    
            // Filter out current bot's username
            const otherBotUsernames = this.allBotUsernames.filter(username => username !== this.currentUsername);
    
            // Find all unreplied bot notifications
            const botNotifications = await this.page.evaluate(async (otherBotUsernames) => {
                const notifications = document.querySelectorAll('[data-testid="tweet"]');
                const botTweets = [];
    
                for (const notification of notifications) {
                    try {
                        const usernameElement = notification.querySelector('[data-testid="User-Name"]');
                        const contentElement = notification.querySelector('[data-testid="tweetText"]');
                        const timeElement = notification.querySelector('time');
                        
                        // Add null checks for all elements
                        if (!usernameElement || !contentElement || !timeElement) {
                            continue;
                        }

                        // Only process if it's from another bot
                        if (!otherBotUsernames.some(botUsername => 
                            usernameElement.textContent.includes(botUsername))) {
                            continue;
                        }
                        
                        const replyCount = notification.querySelector('[data-testid="reply"] [data-testid="app-text-transition-container"]');
                        const hasReplies = replyCount && parseInt(replyCount.textContent) > 0;
    
                        if (hasReplies) {
                            continue;
                        }

                        const timeLink = timeElement.parentElement;
                        if (!timeLink) {
                            continue;
                        }

                        const tweetUrl = timeLink.getAttribute('href');
                        if (!tweetUrl) {
                            continue;
                        }

                        botTweets.push({
                            username: usernameElement.textContent,
                            content: contentElement.textContent,
                            tweetUrl
                        });
                    } catch (err) {
                        console.error('Error processing notification:', err);
                        continue;
                    }
                }
                return botTweets;
            }, otherBotUsernames);
    
            console.log(`${this.personality.name}: Found ${botNotifications.length} unreplied bot notifications`);
    
            // Process each bot notification
            for (const notification of botNotifications) {
                try {
                    // Check thread depth before replying
                    const threadDepth = await this.getThreadDepth(notification.tweetUrl);
                    
                    if (threadDepth >= 3) {
                        console.log(`${this.personality.name}: Thread depth (${threadDepth}) exceeds limit, skipping...`);
                        continue;
                    }
        
                    await this.processAndReplyToTweet(notification, notification.username, true);
                    break; // Only reply to one notification per run to avoid spamming
                } catch (err) {
                    console.error('Error processing notification:', err);
                    continue;
                }
            }
    
            await this.returnToHome();
    
        } catch (error) {
            await this.returnToHome();
            await this.errorHandler.handleError(error, 'Replying to bot notifications');
        }
    }

    async getThreadDepth(tweetUrl) {
        try {
            // Navigate to the tweet
            await this.page.evaluate(url => {
                window.location.href = url;
            }, tweetUrl);
            await Utilities.delay(3000);

            // Count the number of replies in the thread
            const depth = await this.page.evaluate(() => {
                const tweets = document.querySelectorAll('[data-testid="tweet"]');
                return tweets.length;
            });

            return depth;
        } catch (error) {
            console.error('Error getting thread depth:', error);
            return 999; // Return a high number to skip the thread on error
        }
    }

    async replyToSpecificUser(targetUsername) {
        try {
            console.log(`${this.personality.name}: Looking for tweets from @${targetUsername}...`);
    
            // Find all suitable tweets from the specific user
            const targetTweetsData = await this.page.evaluate((username) => {
                const tweets = document.querySelectorAll('[data-testid="tweet"]');
                const suitableTweets = [];
                
                for (const tweet of tweets) {
                    const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                    if (usernameElement && usernameElement.textContent.includes(`@${username}`)) {
                        const contentElement = tweet.querySelector('[data-testid="tweetText"]');
                        const replyCount = tweet.querySelector('[data-testid="reply"] [data-testid="app-text-transition-container"]');
                        const replyNumber = replyCount ? parseInt(replyCount.textContent) : 0;
                        const hasTooManyReplies = replyNumber >= 3;
    
                        if (contentElement && !hasTooManyReplies) {
                            const timeLink = tweet.querySelector('time').parentElement;
                            const tweetUrl = timeLink ? timeLink.getAttribute('href') : null;
    
                            if (tweetUrl) {
                                suitableTweets.push({
                                    content: contentElement.textContent,
                                    tweetUrl,
                                });
                            }
                        }
                    }
                }
                return suitableTweets;
            }, targetUsername);
    
            if (targetTweetsData.length === 0) {
                console.log(`${this.personality.name}: No suitable tweets found from @${targetUsername}, skipping reply.`);
                return;
            }
    
            // Try each tweet until we find one we haven't replied to
            for (const tweetData of targetTweetsData) {
                const hasReplied = await this.checkIfAlreadyReplied(tweetData);
                if (!hasReplied) {
                    await this.processAndReplyToTweet(tweetData, targetUsername, false);
                    break;
                } else {
                    console.log(`${this.personality.name}: Already replied to tweet, skipping...`);
                }
            }
            
            await this.returnToHome();
    
        } catch (error) {
            await this.returnToHome();
            await this.errorHandler.handleError(error, 'Replying to tweet');
        }
    }

    async checkIfAlreadyReplied(tweetData) {
        try {
            // Navigate to the specific tweet
            await this.page.evaluate(tweetUrl => {
                window.location.href = tweetUrl;
            }, tweetData.tweetUrl);

            await Utilities.delay(3000);

            // Extract bot's name from personality (removes "Name: " prefix)
            const botName = this.personality.name.replace('Name: ', '');

            // Check for bot's presence in the thread
            const hasReply = await this.page.evaluate((botName, targetContent) => {
                const allTweets = document.querySelectorAll('[data-testid="tweet"]');
                const tweetsArray = Array.from(allTweets);
                
                const targetIndex = tweetsArray.findIndex(tweet => 
                    tweet.querySelector('[data-testid="tweetText"]')?.textContent === targetContent
                );
                
                const laterTweets = tweetsArray.slice(targetIndex + 1);
                
                return laterTweets.some(tweet => {
                    const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                    return usernameElement?.textContent.includes(botName);
                });
            }, botName, tweetData.content);

            console.log(`${this.personality.name}: Checking for existing reply - ${hasReply ? 'Found reply' : 'No reply found'}`);
            return hasReply;

        } catch (error) {
            console.error('Error checking for existing reply:', error);
            return true; // Err on the side of caution - assume we've replied if there's an error
        }
    }

    async getThreadContext() {
        return await this.page.evaluate(() => {
            const tweets = [];
            const threadContainers = Array.from(document.querySelectorAll('[data-testid="cellInnerDiv"]'));
            
            const discoverMoreIndex = threadContainers.findIndex(div => 
                div.textContent.includes('Discover more')
            );
            
            const relevantContainers = discoverMoreIndex !== -1 
                ? threadContainers.slice(0, discoverMoreIndex)
                : threadContainers;

            for (const container of relevantContainers) {
                const tweetElements = container.querySelectorAll('[data-testid="tweet"]');
                
                for (const tweet of tweetElements) {
                    const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                    const contentElement = tweet.querySelector('[data-testid="tweetText"]');

                    if (usernameElement && contentElement) {
                        tweets.unshift({
                            username: usernameElement.textContent,
                            content: contentElement.textContent
                        });

                        if (tweets.length >= 10) break;
                    }
                }
                
                if (tweets.length >= 10) break;
            }
            
            return tweets.reverse();
        });
    }

    async postReply(reply, targetUsername) {
        const textareaSelector = '[data-testid="tweetTextarea_0"]';
        const textarea = await this.page.waitForSelector(textareaSelector);
        await textarea.click();
        await this.page.keyboard.type(reply, { delay: 50 });
        await Utilities.delay(1000);

        const replyButtonSelector = '[data-testid="tweetButton"]';
        await this.page.waitForSelector(replyButtonSelector);
        await this.page.click(replyButtonSelector);

        await Utilities.delay(3000);
        console.log(`${this.personality.name} successfully replied to @${targetUsername}: ${reply}`);
    }

    async returnToHome() {
        try {
            const homeSelector = '[data-testid="AppTabBar_Home_Link"]';
            await this.page.waitForSelector(homeSelector);
            await this.page.click(homeSelector);
            await Utilities.delay(2000);
        } catch (navError) {
            console.error('Error returning to home:', navError);
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
            tweet = tweet.slice(0, 276) + "...";
        }

        return tweet;
    }
}

module.exports = ReplyOperations;
