const BrowserManager = require('./browser/BrowserManager');
const Authentication = require('./auth/Authentication');
const TweetOperations = require('./tweets/TweetOperations');
const ErrorHandler = require('./utils/ErrorHandler');
const path = require('path');

class TwitterBot {
    constructor(credentials, personality) {
        this.credentials = credentials;
        this.personality = personality;
        this.browserManager = new BrowserManager();
    }

    async run() {
        try {
            // Initialize browser
            const page = await this.browserManager.init(__dirname);
            
            // Initialize error handler
            const errorHandler = new ErrorHandler(page, this.personality);
            
            // Initialize components
            const auth = new Authentication(page, this.credentials, this.personality, errorHandler);
            const tweetOps = new TweetOperations(page, this.personality, errorHandler);

            // Execute workflow
            await auth.login();
            await tweetOps.replyToUserFromNotifications('libertybelltail');
            await tweetOps.readFollowingTweets();
            await tweetOps.replyToSpecificUser('libertybelltail');
            const tweet = await tweetOps.generateTweet();
            await tweetOps.postTweet(tweet);
            await auth.logout();
            
        } catch (error) {
            console.error(`Bot run failed for ${this.personality.name}:`, error);
            throw error;
        } finally {
            await this.browserManager.close();
        }
    }
}

module.exports = TwitterBot;
