class TweetContentExtractor {
    /**
     * 트윗 요소에서 @멘션을 포함한 완전한 텍스트 추출
     * @param {Element} element - 트윗 텍스트 요소
     * @returns {string} 추출된 텍스트
     */
    static extractFullTweetContent(element) {
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

    /**
     * 컨텍스트용 트윗 내용 추출 (이모지 포함)
     * @param {Element} element - 트윗 텍스트 요소
     * @returns {string} 추출된 텍스트
     */
    static extractFullTweetContentInContext(element) {
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

    /**
     * 인용 트윗을 포함한 전체 트윗 내용 추출
     * @param {Element} tweetElement - 트윗 요소
     * @returns {string} 추출된 트윗 내용
     */
    static extractTweetContent(tweetElement) {
        const contentElement = tweetElement.querySelector('[data-testid="tweetText"]');
        if (!contentElement) return '';
        
        let tweetContent = this.extractFullTweetContent(contentElement);
        
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

module.exports = TweetContentExtractor; 