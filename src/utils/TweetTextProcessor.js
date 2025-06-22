class TweetTextProcessor {
    /**
     * 한국어 문자를 고려한 바이트 길이 계산
     * @param {string} text - 계산할 텍스트
     * @returns {number} 바이트 길이
     */
    static calculateByteLength(text) {
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

    /**
     * 지정된 바이트 제한에 맞게 텍스트 자르기
     * @param {string} text - 자를 텍스트
     * @param {number} maxBytes - 최대 바이트 수
     * @returns {string} 잘린 텍스트
     */
    static truncateByByteLength(text, maxBytes) {
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

    /**
     * 트윗 텍스트 정리 (따옴표, 해시태그, 멘션 제거 및 바이트 제한 적용)
     * @param {string} tweet - 정리할 트윗 텍스트
     * @returns {string} 정리된 트윗 텍스트
     */
    static cleanupTweet(tweet) {
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
}

module.exports = TweetTextProcessor; 