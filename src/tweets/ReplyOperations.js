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
            "IMPORTANT: Keep your tweet under 280 bytes. Don't use @, hashtags, or emojis. Simply write the tweet content." +
            "\nIMPORTANT: 트윗은 한국어로 작성하세요.";

        // Different user prompts based on context and whether target is bot or user
        let userPrompt;
        if (isFromNotification) {
            userPrompt = isBot 
                ? "Generate a reply to this user's tweet. Consider the entire conversation thread for context. Be concise and relevant."
                : "Generate a reply to Belle's tweet. Consider the entire conversation thread for context. Be concise and relevant.";
        } else {
            userPrompt = isBot
                ? "Generate a comment to this user's tweet you found while browsing the feed. You're choosing to engage with this user's tweet among many others you've seen, so make your response meaningful while maintaining your historical persona. Be concise and relevant."
                : "Generate a comment to Belle's tweet you found while browsing the feed. You're choosing to engage with her tweet among many others you've seen, so make your response meaningful while maintaining your historical persona. Consider the entire conversation thread for context. This could be a single tweet she posted to her feed, or a tweet within a thread where she's talking to another user. Be concise and relevant.";
        }

        console.log('\nComplete prompt being sent to Gemini:');
        console.log('System message:', systemPrompt);
        console.log('User message:', userPrompt);

            const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
                    }
                ],
                generationConfig: {
                    temperature: 0.9,
                    maxOutputTokens: 4000
                }
            })
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        
        if (!response.ok) {
            const errorText = await response.text();
            console.log('Error response body:', errorText);
            throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
        }

        const data = await response.json();
        console.log('Full API response:', JSON.stringify(data, null, 2));
        
        // Check for thinking vs regular response structure
        let reply = null;
        const candidate = data.candidates?.[0];
        
        if (candidate?.content?.parts?.[0]?.text) {
            // Standard response format
            reply = candidate.content.parts[0].text;
        } else if (candidate?.content?.parts) {
            // Look for text in any part
            for (const part of candidate.content.parts) {
                if (part.text) {
                    reply = part.text;
                    break;
                }
            }
        } else if (candidate?.content?.text) {
            // Alternative structure
            reply = candidate.content.text;
        }
        
        // If still no reply, try to extract from thinking process
        if (!reply && data.usageMetadata?.thoughtsTokenCount > 0) {
            console.log('Looking for content after thinking process...');
            // Check if there are multiple parts or hidden content
            if (candidate?.content?.role === 'model' && candidate.finishReason !== 'MAX_TOKENS') {
                // Check for alternative content structures
                console.log('Full candidate content:', JSON.stringify(candidate.content, null, 2));
            }
        }

        if (!reply) {
            console.log('No reply found in response. Checking for other content...');
            console.log('Candidates:', data.candidates);
            console.log('Usage metadata:', data.usageMetadata);
            console.log('Prompt feedback:', data.promptFeedback);
            throw new Error('No response content received from Gemini');
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

        // Find and click reply on the target tweet using partial content match
        await this.page.evaluate((targetContent) => {
            const tweets = document.querySelectorAll('[data-testid="tweet"]');
            for (const tweet of tweets) {
                const contentElement = tweet.querySelector('[data-testid="tweetText"]');
                if (contentElement && contentElement.innerText.includes(targetContent)) {
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
                // Helper function to extract tweet content including quoted tweets
                function extractTweetContent(tweetElement) {
                    const contentElement = tweetElement.querySelector('[data-testid="tweetText"]');
                    if (!contentElement) return '';
                    
                    let tweetContent = contentElement.textContent;
                    
                    // Try multiple approaches to find quoted tweets
                    const allTweetTexts = tweetElement.querySelectorAll('[data-testid="tweetText"]');
                    if (allTweetTexts.length > 1) {
                        // If there are multiple tweetText elements, the second one is likely the quoted tweet
                        for (let i = 1; i < allTweetTexts.length; i++) {
                            const additionalText = allTweetTexts[i].textContent;
                            if (additionalText && additionalText !== tweetContent && !tweetContent.includes(additionalText)) {
                                tweetContent += `\n\n[Quoted tweet] ${additionalText}`;
                            }
                        }
                    }
                    
                    // Also try looking for any nested article elements which might contain quoted content
                    const nestedArticles = tweetElement.querySelectorAll('article');
                    if (nestedArticles.length > 1) {
                        for (let i = 1; i < nestedArticles.length; i++) {
                            const nestedText = nestedArticles[i].querySelector('[data-testid="tweetText"]');
                            if (nestedText && nestedText.textContent !== tweetContent && !tweetContent.includes(nestedText.textContent)) {
                                tweetContent += `\n\n[Quoted tweet] ${nestedText.textContent}`;
                            }
                        }
                    }
                    
                    return tweetContent;
                }

                const tweets = [];
                let attempts = 0;
                const maxAttempts = 5;

                while (tweets.length < 10 && attempts < maxAttempts) {
                    const tweetElements = document.querySelectorAll('[data-testid="tweet"]');

                    for (const tweet of tweetElements) {
                        try {
                            const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                            const timeElement = tweet.querySelector('time');
                            
                            // Add null checks for all elements
                            if (!usernameElement || !timeElement) {
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

                            const username = usernameElement.innerText;
                            // Check if this tweet is from one of our other bots
                            if (otherBotUsernames.some(botUsername => username.includes(botUsername))) {
                                // Use helper function that includes quoted tweet content
                                const tweetContent = extractTweetContent(tweet);
                                if (tweetContent) {
                                    tweets.push({
                                        username: username,
                                        content: tweetContent,
                                        tweetUrl
                                    });
                                    if (tweets.length >= 10) break;
                                }
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
                    // Helper function to extract tweet content including quoted tweets
                    function extractTweetContent(tweetElement) {
                        const contentElement = tweetElement.querySelector('[data-testid="tweetText"]');
                        if (!contentElement) return '';
                        
                        let tweetContent = contentElement.textContent;
                        
                        // Check for quoted tweet and append its content
                        const quotedTweet = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="tweetText"]');
                        if (quotedTweet) {
                            const quotedUsername = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="User-Name"]')?.textContent || '';
                            tweetContent += `\n\n[인용: ${quotedUsername}] ${quotedTweet.textContent}`;
                        }
                        
                        return tweetContent;
                    }

                    const notifications = document.querySelectorAll('[data-testid="tweet"]');
                    const tweets = [];

                    for (const notification of notifications) {
                        const usernameElement = notification.querySelector('[data-testid="User-Name"]');
                        if (usernameElement && usernameElement.innerText.includes(`@${username}`)) {
                            // Use helper function that includes quoted tweet content
                            const tweetContent = extractTweetContent(notification);

                            if (tweetContent) {
                                const timeLink = notification.querySelector('time').parentElement;
                                const tweetUrl = timeLink ? timeLink.getAttribute('href') : null;

                                // Only add if we haven't processed this tweet before
                                if (tweetUrl && !processedUrls.includes(tweetUrl)) {
                                    tweets.push({
                                        content: tweetContent,
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
                // Helper function to extract tweet content including quoted tweets
                function extractTweetContent(tweetElement) {
                    const contentElement = tweetElement.querySelector('[data-testid="tweetText"]');
                    if (!contentElement) return '';
                    
                    let tweetContent = contentElement.textContent;
                    
                    // Check for quoted tweet and append its content
                    const quotedTweet = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="tweetText"]');
                    if (quotedTweet) {
                        const quotedUsername = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="User-Name"]')?.textContent || '';
                        tweetContent += `\n\n[Quoted: ${quotedUsername}] ${quotedTweet.textContent}`;
                    }
                    
                    return tweetContent;
                }

                const notifications = document.querySelectorAll('[data-testid="tweet"]');
                const botTweets = [];

                for (const notification of notifications) {
                    try {
                        const usernameElement = notification.querySelector('[data-testid="User-Name"]');
                        const timeElement = notification.querySelector('time');
                        
                        // Add null checks for all elements
                        if (!usernameElement || !timeElement) {
                            continue;
                        }

                        // Only process if it's from another bot
                        if (!otherBotUsernames.some(botUsername => 
                            usernameElement.innerText.includes(botUsername))) {
                            continue;
                        }
                        
                        const replyCount = notification.querySelector('[data-testid="reply"] [data-testid="app-text-transition-container"]');
                        const hasReplies = replyCount && parseInt(replyCount.innerText) > 0;

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

                        // Use helper function that includes quoted tweet content
                        const tweetContent = extractTweetContent(notification);
                        if (tweetContent) {
                            botTweets.push({
                                username: usernameElement.innerText,
                                content: tweetContent,
                                tweetUrl
                            });
                        }
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
                // Helper function to extract tweet content including quoted tweets
                function extractTweetContent(tweetElement) {
                    const contentElement = tweetElement.querySelector('[data-testid="tweetText"]');
                    if (!contentElement) return '';
                    
                    let tweetContent = contentElement.textContent;
                    
                    // Check for quoted tweet and append its content
                    const quotedTweet = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="tweetText"]');
                    if (quotedTweet) {
                        const quotedUsername = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="User-Name"]')?.textContent || '';
                        tweetContent += `\n\n[Quoted: ${quotedUsername}] ${quotedTweet.textContent}`;
                    }
                    
                    return tweetContent;
                }

                const tweets = document.querySelectorAll('[data-testid="tweet"]');
                const suitableTweets = [];
                
                for (const tweet of tweets) {
                    const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                    if (usernameElement && usernameElement.innerText.includes(`@${username}`)) {
                        const replyCount = tweet.querySelector('[data-testid="reply"] [data-testid="app-text-transition-container"]');
                        const replyNumber = replyCount ? parseInt(replyCount.innerText) : 0;
                        const hasTooManyReplies = replyNumber >= 3;

                        // Use helper function that includes quoted tweet content
                        const tweetContent = extractTweetContent(tweet);
                        if (tweetContent && !hasTooManyReplies) {
                            const timeLink = tweet.querySelector('time').parentElement;
                            const tweetUrl = timeLink ? timeLink.getAttribute('href') : null;

                            if (tweetUrl) {
                                suitableTweets.push({
                                    content: tweetContent,
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

            // Increase wait time to ensure page loads completely
            await Utilities.delay(5000);

            // Use the bot's actual username for checking replies
            const botUsername = this.currentUsername;

            // Check for bot's presence in the thread
            const hasReply = await this.page.evaluate((botUsername, targetContent) => {
                // Get all tweets in the thread
                const allTweets = document.querySelectorAll('[data-testid="tweet"]');
                const tweetsArray = Array.from(allTweets);
                
                // Find the target tweet's index using partial content match
                const targetIndex = tweetsArray.findIndex(tweet => {
                    const tweetText = tweet.querySelector('[data-testid="tweetText"]')?.innerText;
                    return tweetText && tweetText.includes(targetContent);
                });

                if (targetIndex === -1) return false;

                // Check all tweets in the thread after the target tweet
                const repliesSection = tweetsArray.slice(targetIndex + 1);
                
                // Look for any reply from the bot using the actual username
                return repliesSection.some(tweet => {
                    const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                    return usernameElement && usernameElement.innerText.includes(botUsername);
                });
            }, botUsername, tweetData.content);

            const replyStatus = hasReply ? 'Found reply' : 'No reply found';
            console.log(`${this.personality.name}: Checking for existing reply - ${replyStatus}`);
            
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

            // Process containers in reverse to get most recent tweets first
            for (const container of relevantContainers.reverse()) {
                const tweetElements = container.querySelectorAll('[data-testid="tweet"]');
                
                // Process tweets in reverse order within each container
                const tweetsArray = Array.from(tweetElements);
                for (const tweet of tweetsArray.reverse()) {
                    const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                    const contentElement = tweet.querySelector('[data-testid="tweetText"]');

                    if (usernameElement && contentElement) {
                        // Extract text content including emojis for main tweet
                        let content = Array.from(contentElement.childNodes)
                            .map(node => {
                                if (node.nodeType === Node.TEXT_NODE) {
                                    return node.textContent.trim();
                                }
                                // For img nodes (emojis), get the alt text which contains the emoji
                                if (node.nodeName === 'IMG' && node.alt) {
                                    return node.alt;
                                }
                                // For span nodes, get their text content
                                if (node.nodeName === 'SPAN') {
                                    return node.textContent.trim();
                                }
                                return '';
                            })
                            .filter(text => text) // Remove empty strings
                            .join(' '); // Join with spaces to prevent word concatenation

                        // Try multiple approaches to find quoted tweets
                        const allTweetTexts = tweet.querySelectorAll('[data-testid="tweetText"]');
                        if (allTweetTexts.length > 1) {
                            // If there are multiple tweetText elements, the second one is likely the quoted tweet
                            for (let i = 1; i < allTweetTexts.length; i++) {
                                const quotedContent = Array.from(allTweetTexts[i].childNodes)
                                    .map(node => {
                                        if (node.nodeType === Node.TEXT_NODE) {
                                            return node.textContent.trim();
                                        }
                                        if (node.nodeName === 'IMG' && node.alt) {
                                            return node.alt;
                                        }
                                        if (node.nodeName === 'SPAN') {
                                            return node.textContent.trim();
                                        }
                                        return '';
                                    })
                                    .filter(text => text)
                                    .join(' ');
                                    
                                if (quotedContent && quotedContent !== content && !content.includes(quotedContent)) {
                                    content += `\n\n[Quoted tweet] ${quotedContent}`;
                                }
                            }
                        }
                        
                        // Also try looking for nested articles
                        const nestedArticles = tweet.querySelectorAll('article');
                        if (nestedArticles.length > 1) {
                            for (let i = 1; i < nestedArticles.length; i++) {
                                const nestedText = nestedArticles[i].querySelector('[data-testid="tweetText"]');
                                if (nestedText) {
                                    const quotedContent = Array.from(nestedText.childNodes)
                                        .map(node => {
                                            if (node.nodeType === Node.TEXT_NODE) {
                                                return node.textContent.trim();
                                            }
                                            if (node.nodeName === 'IMG' && node.alt) {
                                                return node.alt;
                                            }
                                            if (node.nodeName === 'SPAN') {
                                                return node.textContent.trim();
                                            }
                                            return '';
                                        })
                                        .filter(text => text)
                                        .join(' ');
                                        
                                    if (quotedContent && quotedContent !== content && !content.includes(quotedContent)) {
                                        content += `\n\n[Quoted tweet] ${quotedContent}`;
                                    }
                                }
                            }
                        }

                        const username = usernameElement.textContent;
                        
                        tweets.push({
                            username: username,
                            content: content
                        });

                        if (tweets.length >= 10) break;
                    }
                }
                
                if (tweets.length >= 10) break;
            }
            
            return tweets.reverse();
        });
    }

    // ... [rest of the code unchanged] ...

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

        // Enforce byte limit (280 bytes)
        tweet = this.truncateByByteLength(tweet, 280);

        return tweet;
    }

    // Calculate byte length considering Korean characters as 2 bytes and English as 1 byte
    calculateByteLength(text) {
        let byteLength = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charAt(i);
            const charCode = char.charCodeAt(0);
            
            // Korean characters (Hangul syllables: U+AC00 to U+D7AF)
            // Korean Jamo (U+1100 to U+11FF, U+3130 to U+318F, U+A960 to U+A97F)
            // Other CJK characters and symbols
            if ((charCode >= 0xAC00 && charCode <= 0xD7AF) || // Hangul syllables
                (charCode >= 0x1100 && charCode <= 0x11FF) || // Hangul Jamo
                (charCode >= 0x3130 && charCode <= 0x318F) || // Hangul Compatibility Jamo
                (charCode >= 0xA960 && charCode <= 0xA97F) || // Hangul Jamo Extended-A
                (charCode >= 0x3400 && charCode <= 0x4DBF) || // CJK Extension A
                (charCode >= 0x4E00 && charCode <= 0x9FFF) || // CJK Unified Ideographs
                (charCode >= 0xF900 && charCode <= 0xFAFF) || // CJK Compatibility Ideographs
                (charCode >= 0x2E80 && charCode <= 0x2EFF) || // CJK Radicals Supplement
                (charCode >= 0x2F00 && charCode <= 0x2FDF) || // Kangxi Radicals
                (charCode >= 0x31C0 && charCode <= 0x31EF) || // CJK Strokes
                (charCode >= 0x3200 && charCode <= 0x32FF) || // Enclosed CJK Letters and Months
                (charCode >= 0x3300 && charCode <= 0x33FF) || // CJK Compatibility
                (charCode >= 0xFE30 && charCode <= 0xFE4F) || // CJK Compatibility Forms
                (charCode >= 0xFF00 && charCode <= 0xFFEF)) { // Halfwidth and Fullwidth Forms
                byteLength += 2;
            } else {
                byteLength += 1;
            }
        }
        return byteLength;
    }

    // Truncate text to fit within specified byte limit
    truncateByByteLength(text, maxBytes) {
        if (this.calculateByteLength(text) <= maxBytes) {
            return text;
        }

        let truncated = '';
        let currentBytes = 0;
        
        for (let i = 0; i < text.length; i++) {
            const char = text.charAt(i);
            const charCode = char.charCodeAt(0);
            
            // Calculate bytes for this character
            let charBytes = 1;
            if ((charCode >= 0xAC00 && charCode <= 0xD7AF) || // Hangul syllables
                (charCode >= 0x1100 && charCode <= 0x11FF) || // Hangul Jamo
                (charCode >= 0x3130 && charCode <= 0x318F) || // Hangul Compatibility Jamo
                (charCode >= 0xA960 && charCode <= 0xA97F) || // Hangul Jamo Extended-A
                (charCode >= 0x3400 && charCode <= 0x4DBF) || // CJK Extension A
                (charCode >= 0x4E00 && charCode <= 0x9FFF) || // CJK Unified Ideographs
                (charCode >= 0xF900 && charCode <= 0xFAFF) || // CJK Compatibility Ideographs
                (charCode >= 0x2E80 && charCode <= 0x2EFF) || // CJK Radicals Supplement
                (charCode >= 0x2F00 && charCode <= 0x2FDF) || // Kangxi Radicals
                (charCode >= 0x31C0 && charCode <= 0x31EF) || // CJK Strokes
                (charCode >= 0x3200 && charCode <= 0x32FF) || // Enclosed CJK Letters and Months
                (charCode >= 0x3300 && charCode <= 0x33FF) || // CJK Compatibility
                (charCode >= 0xFE30 && charCode <= 0xFE4F) || // CJK Compatibility Forms
                (charCode >= 0xFF00 && charCode <= 0xFFEF)) { // Halfwidth and Fullwidth Forms
                charBytes = 2;
            }
            
            // Check if adding this character would exceed the limit
            if (currentBytes + charBytes > maxBytes) {
                // If we can't even fit "...", just return what we have
                if (currentBytes + 3 > maxBytes) {
                    break;
                }
                // Add "..." and break
                truncated += "...";
                break;
            }
            
            truncated += char;
            currentBytes += charBytes;
        }
        
        return truncated;
    }

    // Helper function to extract full tweet content including quoted tweets
    extractTweetContent(tweetElement) {
        const contentElement = tweetElement.querySelector('[data-testid="tweetText"]');
        if (!contentElement) return '';
        
        let tweetContent = contentElement.textContent;
        
        // Try multiple possible selectors for quoted tweets
        const quotedTweetSelectors = [
            '[data-testid="quoteTweet"] [data-testid="tweetText"]',
            '[role="blockquote"] [data-testid="tweetText"]',
            '[data-testid="quoteTweet"] [lang]',
            'article[role="article"] [data-testid="tweetText"]',
            '.r-1tl8opc [data-testid="tweetText"]',  // CSS class that might be used
            '[data-testid="tweet"] [data-testid="tweetText"]'  // Nested tweet structure
        ];
        
        for (const selector of quotedTweetSelectors) {
            const quotedTweets = tweetElement.querySelectorAll(selector);
            // Skip the first one as it's likely the main tweet
            if (quotedTweets.length > 1) {
                const quotedTweet = quotedTweets[1];
                if (quotedTweet && quotedTweet.textContent !== tweetContent) {
                    // Try to find the username for the quoted tweet
                    let quotedUsername = '';
                    const usernameSelectors = [
                        '[data-testid="quoteTweet"] [data-testid="User-Name"]',
                        '[role="blockquote"] [data-testid="User-Name"]',
                        '[data-testid="quoteTweet"] a[role="link"]'
                    ];
                    
                    for (const userSelector of usernameSelectors) {
                        const userElement = tweetElement.querySelector(userSelector);
                        if (userElement) {
                            quotedUsername = userElement.textContent;
                            break;
                        }
                    }
                    
                    tweetContent += `\n\n[Quoted: ${quotedUsername}] ${quotedTweet.textContent}`;
                    break;
                }
            }
        }
        
        // Alternative approach: look for any additional tweet text within the same element
        const allTweetTexts = tweetElement.querySelectorAll('[data-testid="tweetText"]');
        if (allTweetTexts.length > 1) {
            for (let i = 1; i < allTweetTexts.length; i++) {
                const additionalText = allTweetTexts[i].textContent;
                if (additionalText && additionalText !== tweetContent && !tweetContent.includes(additionalText)) {
                    tweetContent += `\n\n[Quoted tweet] ${additionalText}`;
                }
            }
        }
        
        return tweetContent;
    }
}

module.exports = ReplyOperations;
