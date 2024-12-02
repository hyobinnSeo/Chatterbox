require('dotenv').config();
const cron = require('node-cron');
const TwitterBot = require('./bot');
const georgeWashington = require('./personalities/george-washington');
const johnAdams = require('./personalities/john-adams');
const thomasJefferson = require('./personalities/thomas-jefferson');

// Configure bot instances
const bots = [
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_GEORGE_WASHINGTON,
            password: process.env.TWITTER_PASSWORD_GEORGE_WASHINGTON
        },
        personality: georgeWashington
    },
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_JOHN_ADAMS,
            password: process.env.TWITTER_PASSWORD_JOHN_ADAMS
        },
        personality: johnAdams
    },
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_THOMAS_JEFFERSON,
            password: process.env.TWITTER_PASSWORD_THOMAS_JEFFERSON
        },
        personality: thomasJefferson
    }
];

// Function to run all bots
async function runAllBots() {
    console.log('Starting tweet cycle...');
    
    try {
        for (const bot of bots) {
            try {
                const twitterBot = new TwitterBot(bot.credentials, bot.personality);
                await twitterBot.run();
                
                // Add random delay between bots (1-5 minutes) to avoid suspicious activity
                const delay = Math.floor(Math.random() * (300000 - 60000) + 60000);
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (error) {
                console.error(`Error running ${bot.personality.name} bot:`, error);
                // Continue with next bot instead of stopping the entire cycle
            }
        }
    } catch (error) {
        console.error('Fatal error in tweet cycle:', error);
    } finally {
        console.log('Tweet cycle completed');
    }
}

// Schedule tweets using cron
const tweetSchedule = process.env.TWEET_FREQUENCY || '0 * * * *';  // Default to every hour
cron.schedule(tweetSchedule, runAllBots);

// Initial run
console.log('Historical Twitter Bots initialized');
console.log('Tweet schedule:', tweetSchedule);
runAllBots();

// Handle process termination
process.on('SIGINT', async () => {
    console.log('Shutting down bots...');
    process.exit();
});
