const BrowserManager = require('./browser/BrowserManager');
const Authentication = require('./auth/Authentication');
const TweetOperations = require('./tweets/TweetOperations');
const ReplyOperations = require('./tweets/ReplyOperations');
const ErrorHandler = require('./utils/ErrorHandler');
const path = require('path');

class TwitterBot {
    constructor(credentials, personality, allBotUsernames, targetUser) {
        this.credentials = credentials;
        this.personality = personality;
        this.allBotUsernames = allBotUsernames;
        this.targetUser = targetUser;
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
            const replyOps = new ReplyOperations(page, this.personality, errorHandler, this.credentials.username, this.allBotUsernames);

            // Execute workflow
            await auth.login();
            await replyOps.replyToSpecificUserFromNotifications(this.targetUser);
            await replyOps.replyToBotNotifications();
            await tweetOps.readFollowingTweets();
            await replyOps.replyToSpecificUser(this.targetUser);
            await replyOps.replyToBotTweets();
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
