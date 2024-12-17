require('dotenv').config();
const readline = require('readline');
const TwitterBot = require('./src/TwitterBot');

// Import all personalities
const georgeWashington = require('./personalities/george-washington');
const johnAdams = require('./personalities/john-adams');
const thomasJefferson = require('./personalities/thomas-jefferson');
const abrahamLincoln = require('./personalities/abraham-lincoln');
const georgeMcClellan = require('./personalities/george-mcclellan');
const henryClay = require('./personalities/henry-clay');
const johnCCalhoun = require('./personalities/john-c-calhoun');
const henryJackson = require('./personalities/henry-jackson');
const andrewJackson = require('./personalities/andrew-Jackson');
const franklinPierce = require('./personalities/franklin-pierce');

// Configure target user
const targetUser = 'libertybelltail';

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
    },
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_ABRAHAM_LINCOLN,
            password: process.env.TWITTER_PASSWORD_ABRAHAM_LINCOLN
        },
        personality: abrahamLincoln
    },
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_GEORGE_B_MCCLELLAN,
            password: process.env.TWITTER_PASSWORD_GEORGE_B_MCCLELLAN
        },
        personality: georgeMcClellan
    },
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_HENRY_CLAY,
            password: process.env.TWITTER_PASSWORD_HENRY_CLAY
        },
        personality: henryClay
    },
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_JOHN_C_CALHOUN,
            password: process.env.TWITTER_PASSWORD_JOHN_C_CALHOUN
        },
        personality: johnCCalhoun
    },
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_HENRY_M_JACKSON,
            password: process.env.TWITTER_PASSWORD_HENRY_M_JACKSON
        },
        personality: henryJackson
    },
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_ANDREW_JACKSON,
            password: process.env.TWITTER_PASSWORD_ANDREW_JACKSON
        },
        personality: andrewJackson
    },
    {
        credentials: {
            username: process.env.TWITTER_USERNAME_FRANKLIN_PIERCE,
            password: process.env.TWITTER_PASSWORD_FRANKLIN_PIERCE
        },
        personality: franklinPierce
    }
];

// Extract all bot usernames
const allBotUsernames = bots.map(bot => bot.credentials.username);

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Display available bots
console.log('\nAvailable bots:');
bots.forEach((bot, index) => {
    console.log(`${index + 1}. ${bot.personality.name}`);
});

// Prompt for bot selection
rl.question('\nEnter the number of the bot you want to test: ', async (answer) => {
    const botIndex = parseInt(answer) - 1;
    
    if (botIndex >= 0 && botIndex < bots.length) {
        const selectedBot = bots[botIndex];
        console.log(`\nRunning bot: ${selectedBot.personality.name}`);
        
        try {
            const twitterBot = new TwitterBot(
                selectedBot.credentials,
                selectedBot.personality,
                allBotUsernames,
                targetUser
            );
            await twitterBot.run();
            console.log(`\nBot ${selectedBot.personality.name} completed successfully`);
        } catch (error) {
            console.error(`Error running ${selectedBot.personality.name} bot:`, error);
        }
    } else {
        console.error('Invalid bot number selected');
    }
    
    rl.close();
});

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\nShutting down test bot...');
    process.exit();
});
