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
                "\nIMPORTANT: 트윗은 한국어로 작성하세요.";

            const userPrompt = "Generate a single tweet while maintaining your historical persona. Be concise and impactful.";

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
            let tweet = null;
            const candidate = data.candidates?.[0];
            
            if (candidate?.content?.parts?.[0]?.text) {
                // Standard response format
                tweet = candidate.content.parts[0].text;
            } else if (candidate?.content?.parts) {
                // Look for text in any part
                for (const part of candidate.content.parts) {
                    if (part.text) {
                        tweet = part.text;
                        break;
                    }
                }
            } else if (candidate?.content?.text) {
                // Alternative structure
                tweet = candidate.content.text;
            }
            
            // If still no tweet, try to extract from thinking process
            if (!tweet && data.usageMetadata?.thoughtsTokenCount > 0) {
                console.log('Looking for content after thinking process...');
                // Check if there are multiple parts or hidden content
                if (candidate?.content?.role === 'model' && candidate.finishReason !== 'MAX_TOKENS') {
                    // Check for alternative content structures
                    console.log('Full candidate content:', JSON.stringify(candidate.content, null, 2));
                }
            }

            if (!tweet) {
                console.log('No tweet found in response. Checking for other content...');
                console.log('Candidates:', data.candidates);
                console.log('Usage metadata:', data.usageMetadata);
                console.log('Prompt feedback:', data.promptFeedback);
                throw new Error('No response content received from Gemini');
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

    extractFullTweetContent(element) {
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
}

module.exports = TweetOperations;
