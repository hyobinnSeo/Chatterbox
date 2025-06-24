const Utilities = require('../utils/Utilities');
const TweetContentExtractor = require('../utils/TweetContentExtractor');
const TweetTextProcessor = require('../utils/TweetTextProcessor');
const GeminiApiClient = require('../utils/GeminiApiClient');

class ReplyOperations {
    constructor(page, personality, errorHandler, currentUsername, allBotUsernames) {
        this.page = page;
        this.personality = personality;
        this.errorHandler = errorHandler;
        this.currentUsername = currentUsername;
        this.allBotUsernames = allBotUsernames;
    }

    // Common browser-side functions (to be injected into evaluate contexts)
    getBrowserHelperFunctions() {
        return `
            // Helper function to extract tweet content including quoted tweets
            function extractTweetContent(tweetElement) {
                const contentElement = tweetElement.querySelector('[data-testid="tweetText"]');
                if (!contentElement) return '';
                
                let tweetContent = extractFullTweetContent(contentElement);
                
                // Try multiple approaches to find quoted tweets
                const allTweetTexts = tweetElement.querySelectorAll('[data-testid="tweetText"]');
                if (allTweetTexts.length > 1) {
                    // If there are multiple tweetText elements, the second one is likely the quoted tweet
                    for (let i = 1; i < allTweetTexts.length; i++) {
                        const additionalText = extractFullTweetContent(allTweetTexts[i]);
                        if (additionalText && additionalText !== tweetContent && !tweetContent.includes(additionalText)) {
                            tweetContent += "\\n\\n[Quoted tweet from someone else] " + additionalText;
                        }
                    }
                }
                
                // Also try looking for any nested article elements which might contain quoted content
                const nestedArticles = tweetElement.querySelectorAll('article');
                if (nestedArticles.length > 1) {
                    for (let i = 1; i < nestedArticles.length; i++) {
                        const nestedText = nestedArticles[i].querySelector('[data-testid="tweetText"]');
                        if (nestedText) {
                            const quotedContent = extractFullTweetContent(nestedText);
                            if (quotedContent && quotedContent !== tweetContent && !tweetContent.includes(quotedContent)) {
                                tweetContent += "\\n\\n[Quoted tweet from someone else] " + quotedContent;
                            }
                        }
                    }
                }
                
                return tweetContent;
            }

            // Helper function to extract complete text including @mentions
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
        `;
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
            "\nIMPORTANT: 트윗은 한국어로 작성하세요. (하게체나 하오체를 사용하지 마세요.)" +
            "\nIMPORTANT: Quotes나 예시 문장들은 문장의 스타일과 톤을 참고하는 용도로만 활용하고 그것을 재사용하거나 똑같이 반복하지 마세요.";

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

        const reply = await GeminiApiClient.generateContent(systemPrompt, userPrompt, this.personality.name);
        return TweetTextProcessor.cleanupTweet(reply);
    }

    async processAndReplyToTweet(tweetData, targetUsername, isFromNotification = false, skipAlreadyRepliedCheck = false) {
        // Navigate to the specific tweet
        await this.page.evaluate(tweetUrl => {
            window.location.href = tweetUrl;
        }, tweetData.tweetUrl);

        await Utilities.delay(3000);

        // Check if we've already replied to this tweet (skip for bot-to-bot notifications)
        if (!skipAlreadyRepliedCheck) {
            console.log(`${this.personality.name}: Checking for existing replies before responding...`);
            const alreadyReplied = await this.checkIfAlreadyReplied(tweetData);
            
            if (alreadyReplied) {
                console.log(`${this.personality.name}: Already replied to this tweet. Skipping to avoid duplicate.`);
                return;
            }
        } else {
            console.log(`${this.personality.name}: Skipping already replied check for bot-to-bot notification`);
        }

        // Get thread context
        const threadContext = await this.getThreadContext();

        // Check if we need to open reply modal first
        const needsReplyModal = await this.page.evaluate(() => {
            // Check if we're on a tweet page but reply modal is not open
            const isOnTweetPage = window.location.href.includes('/status/');
            const hasReplyTextarea = document.querySelector('[data-testid="tweetTextarea_0"]');
            const hasModal = document.querySelector('[aria-modal="true"]');
            
            console.log(`DEBUG: On tweet page: ${isOnTweetPage}, Has textarea: ${!!hasReplyTextarea}, Has modal: ${!!hasModal}`);
            
            // If we're on tweet page but don't have textarea or modal, need to click reply
            return isOnTweetPage && !hasReplyTextarea && !hasModal;
        });

        if (needsReplyModal) {
            console.log(`${this.personality.name}: Need to open reply modal first`);

        // Find and click reply on the target tweet using partial content match
            const replyClicked = await this.page.evaluate((targetContent) => {
            const tweets = document.querySelectorAll('[data-testid="tweet"]');
            for (const tweet of tweets) {
                const contentElement = tweet.querySelector('[data-testid="tweetText"]');
                    if (contentElement && contentElement.innerText.includes(targetContent.substring(0, 50))) {
                    const replyButton = tweet.querySelector('[data-testid="reply"]');
                    if (replyButton) {
                            console.log(`DEBUG: Clicking reply button for tweet: "${contentElement.innerText.substring(0, 50)}..."`);
                        replyButton.click();
                            return true;
                        }
                    }
                }
                
                // Fallback: try to find any reply button
                const replyButtons = document.querySelectorAll('[data-testid="reply"]');
                if (replyButtons.length > 0) {
                    console.log(`DEBUG: Fallback - clicking first reply button found`);
                    replyButtons[0].click();
                    return true;
                }
                
                return false;
        }, tweetData.content);

            if (replyClicked) {
                console.log(`${this.personality.name}: Reply button clicked, waiting for modal...`);
                await Utilities.delay(3000);
            } else {
                console.log(`${this.personality.name}: Could not find reply button`);
            }
        } else {
            console.log(`${this.personality.name}: Reply interface already available`);
            await Utilities.delay(1000);
        }

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
                    
                    let tweetContent = extractFullTweetContent(contentElement);
                    
                    // Try multiple approaches to find quoted tweets
                    const allTweetTexts = tweetElement.querySelectorAll('[data-testid="tweetText"]');
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
                    const nestedArticles = tweetElement.querySelectorAll('article');
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
                    
                    return tweetContent;
                }

                // Helper function to extract complete text including @mentions
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
                        
                        let tweetContent = extractFullTweetContent(contentElement);
                        
                        // Check for quoted tweet and append its content
                        const quotedTweet = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="tweetText"]');
                        if (quotedTweet) {
                            const quotedUsername = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="User-Name"]')?.textContent || '';
                            tweetContent += `\n\n[인용: ${quotedUsername}] ${quotedTweet.textContent}`;
                        }
                        
                        return tweetContent;
                    }

                    // Helper function to extract complete text including @mentions
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
                    
                    let tweetContent = extractFullTweetContent(contentElement);
                    
                    // Check for quoted tweet and append its content
                    const quotedTweet = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="tweetText"]');
                    if (quotedTweet) {
                        const quotedUsername = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="User-Name"]')?.textContent || '';
                        tweetContent += `\n\n[Quoted: ${quotedUsername}] ${quotedTweet.textContent}`;
                    }
                    
                    return tweetContent;
                }

                // Helper function to extract complete text including @mentions
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
                    
                    // For bot-to-bot replies from notifications, skip the already replied check
                    // since we want to continue conversation threads up to depth 3
                    console.log(`${this.personality.name}: Bot-to-bot notification reply - skipping already replied check, using thread depth only`);
        
                    await this.processAndReplyToTweet(notification, notification.username, true, true);
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
                    
                    let tweetContent = extractFullTweetContent(contentElement);
                    
                    // Check for quoted tweet and append its content
                    const quotedTweet = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="tweetText"]');
                    if (quotedTweet) {
                        const quotedUsername = tweetElement.querySelector('[data-testid="quoteTweet"] [data-testid="User-Name"]')?.textContent || '';
                        tweetContent += `\n\n[Quoted: ${quotedUsername}] ${quotedTweet.textContent}`;
                    }
                    
                    return tweetContent;
                }

                // Helper function to extract complete text including @mentions
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

            // Wait for page to load completely
            await Utilities.delay(5000);

            // Use the bot's username from credentials (without @ symbol if present)
            const botUsername = this.currentUsername.replace('@', '');
            const targetTweetContent = tweetData.content;
            
            console.log(`DEBUG: Looking for bot username: "${botUsername}"`);
            console.log(`DEBUG: Target tweet content (first 100 chars): "${targetTweetContent.substring(0, 100)}..."`);

            // Enhanced check: Find the target tweet and only check tweets below it for bot replies
            const hasReply = await this.page.evaluate((botUsername, targetContent) => {
                console.log(`DEBUG: Checking page for any replies from bot: "${botUsername}"`);
                
                // Get all tweets on this page
                const allTweets = document.querySelectorAll('[data-testid="tweet"]');
                console.log(`DEBUG: Found ${allTweets.length} tweets on page`);
                
                // First, find the index of the target tweet we clicked on
                let targetTweetIndex = -1;
                for (let i = 0; i < allTweets.length; i++) {
                    const tweet = allTweets[i];
                    const contentElement = tweet.querySelector('[data-testid="tweetText"]');
                    if (contentElement) {
                        const tweetContent = contentElement.innerText || contentElement.textContent || '';
                        // Check if this tweet matches our target tweet (first 100 characters for comparison)
                        const contentMatch = tweetContent.substring(0, 100);
                        const targetMatch = targetContent.substring(0, 100);
                        
                        if (contentMatch === targetMatch || tweetContent.includes(targetMatch) || targetMatch.includes(contentMatch)) {
                            targetTweetIndex = i;
                            console.log(`DEBUG: Found target tweet at index ${i}: "${tweetContent.substring(0, 50)}..."`);
                            break;
                        }
                    }
                }
                
                if (targetTweetIndex === -1) {
                    console.log(`DEBUG: Could not find target tweet, checking all tweets except first one`);
                    targetTweetIndex = 0; // Fallback to skip first tweet
                }
                
                // Now check only tweets AFTER the target tweet (these are the replies to the target tweet)
                console.log(`DEBUG: Checking tweets from index ${targetTweetIndex + 1} onwards for bot replies`);
                
                for (let i = targetTweetIndex + 1; i < allTweets.length; i++) {
                    const tweet = allTweets[i];
                    const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                    if (!usernameElement) continue;
                    
                    const usernameText = usernameElement.innerText;
                    console.log(`DEBUG: Reply Tweet ${i}: User: "${usernameText}"`);
                    
                    // Extract @username from the displayed text and compare
                    const atMatch = usernameText.match(/@([a-zA-Z0-9_]+)/);
                    if (atMatch && atMatch[1] === botUsername) {
                        console.log(`DEBUG: ✅ Found bot reply! @${atMatch[1]} === @${botUsername}`);
                        return true;
                    }
                    
                    // Fallback: Check if the username text contains our bot username
                    if (usernameText.toLowerCase().includes(botUsername.toLowerCase())) {
                        console.log(`DEBUG: ✅ Found bot reply! "${usernameText}" contains "${botUsername}"`);
                        return true;
                    }
                }
                
                // Additional check: Look for tweets that are actually replies below the target tweet
                const tweetsAfterTarget = Array.from(allTweets).slice(targetTweetIndex + 1);
                const repliesWithBot = tweetsAfterTarget.filter((tweet) => {
                    const usernameElement = tweet.querySelector('[data-testid="User-Name"]');
                    if (!usernameElement) return false;
                    
                    const usernameText = usernameElement.innerText;
                    const isFromBot = usernameText.toLowerCase().includes(botUsername.toLowerCase()) ||
                                     usernameText.match(/@([a-zA-Z0-9_]+)/)?.[1] === botUsername;
                    
                    if (!isFromBot) return false;
                    
                    // Check if this tweet has a "Replying to" indicator or is positioned as a reply
                    const hasReplyingTo = tweet.textContent.includes('Replying to') || 
                                         tweet.textContent.includes('답글 대상');
                    
                    return hasReplyingTo || true; // Any tweet below target tweet is considered a potential reply
                });
                
                if (repliesWithBot.length > 0) {
                    console.log(`DEBUG: ✅ Found ${repliesWithBot.length} actual bot replies below target tweet`);
                    return true;
                }
                
                console.log(`DEBUG: No bot replies found below the target tweet`);
                return false;
            }, botUsername, targetTweetContent);

            const replyStatus = hasReply ? 'Found existing reply' : 'No existing reply found';
            console.log(`${this.personality.name}: ${replyStatus} below the target tweet`);
            
            return hasReply;

        } catch (error) {
            console.error(`${this.personality.name}: Error checking for existing reply:`, error);
            return true; // Err on the side of caution - assume we've replied if there's an error
        }
    }

    async getThreadContext() {
        return await this.page.evaluate(() => {
            // Helper function to extract complete text including @mentions - defined inside evaluate
            function extractFullTweetContentInContext(element) {
                if (!element) return '';
                
                // Extract text content including emojis and @mentions
                let text = '';
                
                // Method 1: Use innerText which preserves more content than textContent
                if (element.innerText) {
                    text = element.innerText;
                } else if (element.textContent) {
                    text = element.textContent;
                }
                
                // Method 2: Walk through child nodes to capture all content including @mentions
                if (!text.includes('@')) {
                    const parts = [];
                    const walker = document.createTreeWalker(
                        element,
                        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
                        null,
                        false
                    );
                    
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.nodeType === Node.TEXT_NODE) {
                            const textContent = node.textContent.trim();
                            if (textContent) {
                                parts.push(textContent);
                            }
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.nodeName === 'IMG' && node.alt) {
                                // For emoji images, get the alt text
                                parts.push(node.alt);
                            } else if (node.nodeName === 'A') {
                                // For links (potential @mentions)
                                const href = node.getAttribute('href');
                                const linkText = node.textContent;
                                
                                if (href && href.includes('/@') && !linkText.startsWith('@')) {
                                    // This is a @mention link
                                    const username = href.split('/@')[1]?.split('/')[0];
                                    if (username) {
                                        parts.push('@' + username);
                                    } else {
                                        parts.push(linkText);
                                    }
                                } else if (linkText.startsWith('@')) {
                                    parts.push(linkText);
                                } else {
                                    parts.push(linkText);
                                }
                            }
                        }
                    }
                    
                    if (parts.length > 0) {
                        text = parts.join(' ');
                    }
                }
                
                return text.trim();
            }

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
                        // Extract text content including emojis and @mentions for main tweet
                        let content = extractFullTweetContentInContext(contentElement);

                        // Try multiple approaches to find quoted tweets
                        const allTweetTexts = tweet.querySelectorAll('[data-testid="tweetText"]');
                        if (allTweetTexts.length > 1) {
                            // If there are multiple tweetText elements, the second one is likely the quoted tweet
                            for (let i = 1; i < allTweetTexts.length; i++) {
                                const quotedContent = extractFullTweetContentInContext(allTweetTexts[i]);
                                    
                                if (quotedContent && quotedContent !== content && !content.includes(quotedContent)) {
                                    content += `\n\n[Quoted tweet from someone else] ${quotedContent}`;
                                }
                            }
                        }
                        
                        // Also try looking for nested articles
                        const nestedArticles = tweet.querySelectorAll('article');
                        if (nestedArticles.length > 1) {
                            for (let i = 1; i < nestedArticles.length; i++) {
                                const nestedText = nestedArticles[i].querySelector('[data-testid="tweetText"]');
                                if (nestedText) {
                                    const quotedContent = extractFullTweetContentInContext(nestedText);
                                        
                                    if (quotedContent && quotedContent !== content && !content.includes(quotedContent)) {
                                        content += `\n\n[Quoted tweet from someone else] ${quotedContent}`;
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

        // Detect if we're in modal or inline reply mode
        const isModal = await this.page.evaluate(() => {
            const modal = document.querySelector('[aria-modal="true"]');
            const overlay = document.querySelector('[data-testid="modal-overlay"]');
            return !!(modal || overlay);
        });

        console.log(`${this.personality.name}: Reply mode detected: ${isModal ? 'Modal' : 'Inline page'}`);

        // Try multiple approaches to find and click the reply/post button
        let buttonClicked = false;
        
        // Approach 1: Try standard data-testid
        try {
            const replyButtonSelector = '[data-testid="tweetButton"]';
            const button = await this.page.$(replyButtonSelector);
            if (button) {
                await button.click();
                buttonClicked = true;
                console.log(`${this.personality.name}: Clicked reply button using data-testid`);
            }
        } catch (error) {
            console.log(`${this.personality.name}: Standard button selector failed, trying alternatives...`);
        }

        // Approach 2: Enhanced text-based button search with click verification
        if (!buttonClicked) {
            try {
                const buttonClickResult = await this.page.evaluate((isModal) => {
                    const buttons = document.querySelectorAll('button, [role="button"]');
                    
                    // Define buttons to avoid (these are not reply buttons)
                    const avoidTexts = ['Done', '완료', 'Cancel', '취소', 'Close', '닫기', 'Back', '뒤로', 'Delete', '삭제', 'Replying to', '답글 대상'];
                    
                    // Check if we're in "Replying to" modal context
                    const isReplyingToModal = document.querySelector('[aria-labelledby="modal-header"]') && 
                                            (document.textContent.includes('Replying to') || document.textContent.includes('답글 대상'));
                    
                    // For replying to modal, be very strict about Reply button only
                    // Always prioritize exact "Reply" text first
                    const priorityTexts = isReplyingToModal ? ['Reply', '답글'] : 
                                        isModal ? ['Reply', '답글', 'Post', '게시하기', 'Tweet', '트윗'] : 
                                        ['Reply', '답글', 'Post', '게시하기', 'Tweet', '트윗'];
                    
                    console.log(`DEBUG: Context - Modal: ${isModal}, ReplyingToModal: ${isReplyingToModal}`);
                    
                    for (const targetText of priorityTexts) {
                        for (const button of buttons) {
                            const buttonText = button.textContent?.trim();
                            if (!buttonText) continue;
                            
                            // Skip buttons we want to avoid
                            if (avoidTexts.some(avoid => buttonText.toLowerCase().includes(avoid.toLowerCase()))) {
                                console.log(`DEBUG: Skipping avoid button: "${buttonText}"`);
                                continue;
                            }
                            
                            // Additional check: Skip "Replying to" header elements
                            const parentElement = button.parentElement;
                            const isReplyingToHeader = parentElement && (
                                parentElement.textContent?.includes('Replying to') ||
                                parentElement.textContent?.includes('답글 대상') ||
                                button.getAttribute('aria-label')?.includes('Replying to') ||
                                button.getAttribute('aria-label')?.includes('답글 대상')
                            );
                            
                            if (isReplyingToHeader) {
                                console.log(`DEBUG: Skipping "Replying to" header element: "${buttonText}"`);
                                continue;
                            }
                            
                            // Exact match first (highest priority)
                            const isExactMatch = buttonText.toLowerCase() === targetText.toLowerCase();
                            
                            // For Reply buttons, be very strict about exact matches
                            const isValidReplyMatch = (targetText.toLowerCase() === 'reply' || targetText === '답글') ? 
                                                    isExactMatch : 
                                                    (isExactMatch || buttonText.toLowerCase().includes(targetText.toLowerCase()));
                            
                            if (isValidReplyMatch) {
                                // Check if button is enabled and visible
                                const isDisabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
                                const isVisible = button.offsetParent !== null;
                                const rect = button.getBoundingClientRect();
                                const isInViewport = rect.width > 0 && rect.height > 0;
                                
                                // Additional filtering for reply buttons
                                const isInTopArea = rect.top < window.innerHeight * 0.4; // Top 40% of screen
                                const isInRightArea = rect.right > window.innerWidth * 0.8; // Right 20% of screen
                                const hasAvoidKeywords = button.getAttribute('aria-label')?.toLowerCase().includes('close') ||
                                                       button.getAttribute('aria-label')?.toLowerCase().includes('done') ||
                                                       button.className?.includes('close') ||
                                                       button.className?.includes('done');
                                
                                // For "Replying to" modal, be extra strict
                                if (isReplyingToModal) {
                                    // Skip buttons in top-right area (likely "Done" button)
                                    if (isInTopArea && isInRightArea) {
                                        console.log(`DEBUG: Skipping top-right button in replying modal: "${buttonText}"`);
                                        continue;
                                    }
                                    
                                    // Only allow exact Reply button text in this context
                                    if (buttonText.toLowerCase() !== 'reply' && buttonText !== '답글') {
                                        console.log(`DEBUG: Skipping non-reply button in replying modal: "${buttonText}"`);
                                        continue;
                                    }
                                }
                                
                                // Skip buttons in top area that might be "Done" buttons
                                if (isInTopArea && buttonText.toLowerCase() !== 'reply' && buttonText !== '답글') {
                                    console.log(`DEBUG: Skipping top-area button: "${buttonText}"`);
                                    continue;
                                }
                                
                                if (hasAvoidKeywords) {
                                    console.log(`DEBUG: Skipping button with avoid keywords: "${buttonText}"`);
                                    continue;
                                }
                                
                                console.log(`DEBUG: Found valid button "${buttonText}" - Disabled: ${isDisabled}, Visible: ${isVisible}, InViewport: ${isInViewport}, Position: ${rect.top}px from top`);
                                
                                if (!isDisabled && isVisible && isInViewport) {
                                    console.log(`DEBUG: Attempting to click button: "${buttonText}"`);
                                    
                                    // Try multiple click methods
                                    try {
                                        button.click();
                                        console.log(`DEBUG: Clicked button "${buttonText}" successfully`);
                                        return { success: true, buttonText: buttonText, method: 'click()' };
                                    } catch (clickError) {
                                        console.log(`DEBUG: click() failed, trying dispatchEvent`);
                                        // Fallback: dispatch click event
                                        const event = new MouseEvent('click', {
                                            view: window,
                                            bubbles: true,
                                            cancelable: true
                                        });
                                        button.dispatchEvent(event);
                                        return { success: true, buttonText: buttonText, method: 'dispatchEvent' };
                                    }
                                }
                            }
                        }
                        
                        // If we found an exact match for this priority text, don't try others
                        if (priorityTexts.indexOf(targetText) === 0) {
                            const exactButton = Array.from(buttons).find(b => 
                                b.textContent?.trim().toLowerCase() === targetText.toLowerCase());
                            if (exactButton) break; // Found exact match, stop looking
                        }
                    }
                    
                    // Final attempt: Look for Reply button with specific characteristics
                    console.log('DEBUG: Final attempt - looking for specific Reply button');
                    for (const button of buttons) {
                        const buttonText = button.textContent?.trim() || '';
                        const ariaLabel = button.getAttribute('aria-label') || '';
                        const dataTestId = button.getAttribute('data-testid') || '';
                        const rect = button.getBoundingClientRect();
                        
                        // Must be enabled and visible
                        const isDisabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
                        const isVisible = button.offsetParent !== null && rect.width > 0 && rect.height > 0;
                        if (isDisabled || !isVisible) continue;
                        
                        // Skip avoid buttons
                        if (avoidTexts.some(avoid => buttonText.toLowerCase().includes(avoid.toLowerCase()) || 
                                                   ariaLabel.toLowerCase().includes(avoid.toLowerCase()))) {
                            continue;
                        }
                        
                        // Look for Reply button characteristics
                        const hasReplyText = buttonText.toLowerCase() === 'reply' || buttonText === '답글';
                        const hasReplyAria = ariaLabel.toLowerCase().includes('reply') || ariaLabel.includes('답글');
                        const hasReplyTestId = dataTestId.includes('reply');
                        const isInBottomHalf = rect.top > window.innerHeight * 0.5;
                        
                        if ((hasReplyText || hasReplyAria || hasReplyTestId) && !isInTopArea) {
                            console.log(`DEBUG: Found specific Reply button - Text: "${buttonText}", Location: bottom-half: ${isInBottomHalf}`);
                            try {
                                button.click();
                                return { success: true, buttonText: buttonText, method: 'specific-reply-click' };
                            } catch (error) {
                                console.log(`DEBUG: Specific reply button click failed: ${error}`);
                            }
                        }
                    }
                    
                    return { success: false };
                }, isModal);

                if (buttonClickResult.success) {
                    buttonClicked = true;
                    console.log(`${this.personality.name}: Clicked reply button "${buttonClickResult.buttonText}" using ${buttonClickResult.method}`);
                    
                    // Wait for the action to process
                    await Utilities.delay(2000);
                    
                    // Verify the click worked by checking if we're still on the same page or if something changed
                    const clickVerification = await this.page.evaluate(() => {
                        // Check if there are any success indicators
                        const indicators = [
                            document.querySelector('[data-testid="toast"]'), // Success toast
                            document.querySelector('.tweet-success'), // Success message
                            !document.querySelector('[data-testid="tweetTextarea_0"]'), // Textarea disappeared
                            window.location.href.includes('/status/') && !window.location.href.includes('/compose') // Back to status page
                        ];
                        return indicators.some(indicator => indicator);
                    });
                    
                    console.log(`${this.personality.name}: Click verification result: ${clickVerification ? 'Success' : 'May have failed'}`);
                }
            } catch (error) {
                console.log(`${this.personality.name}: Enhanced text-based button search failed:`, error.message);
            }
        }

        // Approach 3: Try alternative selectors (different for modal vs inline)
        if (!buttonClicked) {
            const alternativeSelectors = isModal ? [
                // Modal-specific selectors
                '[data-testid="tweetButtonInline"]',
                '[data-testid="sendTweet"]', 
                '[aria-label*="Tweet"]',
                '[aria-label*="Reply"]',
                '[aria-label*="게시"]',
                '[aria-label*="답글"]',
                'button[type="submit"]',
                'div[role="button"][tabindex="0"]'
            ] : [
                // Inline page-specific selectors - prioritize exact Reply button
                'button:has-text("Reply"):visible',
                'button:has-text("답글"):visible', 
                '[data-testid="tweetButton"]:visible',
                '[data-testid="tweetButtonInline"]:visible',
                '[data-testid="sendTweet"]:visible',
                // More specific inline reply selectors
                'div[data-testid="toolBar"] button[role="button"]',
                'div[data-testid="reply"] button',
                'button[aria-label*="Reply"]',
                'button[aria-label*="답글"]',
                'button[aria-label*="게시"]',
                // Generic button selectors for inline
                'button[data-testid*="tweet"]',
                'button[data-testid*="reply"]',
                'button[data-testid*="Button"]',
                '[role="button"][data-testid*="tweet"]',
                '[role="button"][data-testid*="Button"]',
                'button[type="submit"]',
                'div[role="button"][tabindex="0"]',
                // Fallback text-based selectors
                'button:has-text("게시하기")',
                'button:has-text("Post")'
            ];

            for (const selector of alternativeSelectors) {
                try {
                    const button = await this.page.$(selector);
                    if (button) {
                        const isVisible = await button.isIntersectingViewport();
                        const isEnabled = await this.page.evaluate(el => {
                            return !el.disabled && el.getAttribute('aria-disabled') !== 'true';
                        }, button);

                        if (isVisible && isEnabled) {
                            console.log(`${this.personality.name}: Attempting to click button with selector: ${selector}`);
                            
                            // Try multiple click approaches
                            try {
                                await button.click();
                                console.log(`${this.personality.name}: Successfully clicked button with selector: ${selector}`);
                            } catch (clickError) {
                                console.log(`${this.personality.name}: Standard click failed, trying force click`);
                                await this.page.evaluate(el => el.click(), button);
                            }
                            
                            buttonClicked = true;
                            
                            // Wait and verify
                            await Utilities.delay(2000);
                            const stillOnPage = await this.page.evaluate(() => {
                                return !!document.querySelector('[data-testid="tweetTextarea_0"]');
                            });
                            
                            if (stillOnPage) {
                                console.log(`${this.personality.name}: Warning - still on reply page after clicking ${selector}`);
                                buttonClicked = false; // Reset and try next selector
                                continue;
                            }
                            
                            console.log(`${this.personality.name}: Successfully submitted reply using selector: ${selector}`);
                    break;
                        }
                    }
                } catch (error) {
                    continue; // Try next selector
                }
            }
        }

        // Approach 4: Last resort - find any clickable button in the reply area
        if (!buttonClicked) {
            try {
                const lastResortButton = await this.page.evaluate((isModal) => {
                    // Look for buttons that are likely to be the submit button
                    const allButtons = document.querySelectorAll('button, [role="button"]');
                    console.log(`DEBUG: Found ${allButtons.length} buttons to check`);
                    
                    for (const button of allButtons) {
                        const rect = button.getBoundingClientRect();
                        const isEnabled = !button.disabled && button.getAttribute('aria-disabled') !== 'true';
                        const isVisible = button.offsetParent !== null && rect.width > 0 && rect.height > 0;
                        const buttonText = button.textContent?.trim() || '';
                        const dataTestId = button.getAttribute('data-testid') || '';
                        const ariaLabel = button.getAttribute('aria-label') || '';
                        
                        console.log(`DEBUG: Button - Text: "${buttonText}", TestId: "${dataTestId}", AriaLabel: "${ariaLabel}", Enabled: ${isEnabled}, Visible: ${isVisible}`);
                        
                        if (!isEnabled || !isVisible) continue;
                        
                        let isLikelyReplyButton = false;
                        
                        if (isModal) {
                            // Modal mode: look for typical modal submit buttons
                            const isInBottomArea = rect.bottom > window.innerHeight * 0.3;
                            const hasSubmitProperties = button.type === 'submit' || 
                                                      buttonText.length < 20 ||
                                                      dataTestId.includes('tweet') ||
                                                      dataTestId.includes('Button');
                            isLikelyReplyButton = isInBottomArea && hasSubmitProperties;
                        } else {
                            // Inline mode: look for reply-specific buttons
                            const hasReplyKeywords = buttonText.toLowerCase().includes('reply') ||
                                                   buttonText.includes('답글') ||
                                                   buttonText.includes('게시') ||
                                                   buttonText.toLowerCase().includes('post') ||
                                                   ariaLabel.toLowerCase().includes('reply') ||
                                                   ariaLabel.includes('답글') ||
                                                   dataTestId.includes('tweet') ||
                                                   dataTestId.includes('reply');
                            
                            const isInReplyArea = rect.bottom > window.innerHeight * 0.2;
                            isLikelyReplyButton = hasReplyKeywords && isInReplyArea;
                        }
                        
                        if (isLikelyReplyButton) {
                            console.log(`DEBUG: Clicking button with text: "${buttonText}", testId: "${dataTestId}"`);
                            button.click();
                            return true;
                        }
                    }
                    return false;
                }, isModal);

                if (lastResortButton) {
                    buttonClicked = true;
                    console.log(`${this.personality.name}: Clicked reply button using last resort method (${isModal ? 'Modal' : 'Inline'} mode)`);
                }
            } catch (error) {
                console.log(`${this.personality.name}: Last resort button search failed:`, error.message);
            }
        }

        if (!buttonClicked) {
            // Additional debugging - capture current page state
            const debugInfo = await this.page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                return {
                    url: window.location.href,
                    totalButtons: buttons.length,
                    visibleButtons: buttons.filter(b => b.offsetParent !== null).length,
                    enabledButtons: buttons.filter(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true').length,
                    buttonsWithText: buttons.filter(b => b.textContent?.trim()).map(b => ({
                        text: b.textContent.trim(),
                        testId: b.getAttribute('data-testid'),
                        ariaLabel: b.getAttribute('aria-label'),
                        enabled: !b.disabled && b.getAttribute('aria-disabled') !== 'true',
                        visible: b.offsetParent !== null
                    })).slice(0, 10) // Limit to first 10 for readability
                };
            });
            
            console.error(`${this.personality.name}: Failed to find and click reply button with all methods`);
            console.error(`${this.personality.name}: Debug info:`, debugInfo);
            console.error(`${this.personality.name}: Reply mode was: ${isModal ? 'Modal' : 'Inline page'}`);
            
            // Take a screenshot for debugging
            await this.errorHandler.takeScreenshot('reply-button-not-found');
            
            throw new Error('Unable to find reply/post button');
        }

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




}

module.exports = ReplyOperations;
