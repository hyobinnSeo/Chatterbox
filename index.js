require('dotenv').config();
const cron = require('node-cron');
const readline = require('readline');
const TwitterBot = require('./src/TwitterBot');
const georgeWashington = require('./personalities/george-washington');
const johnAdams = require('./personalities/john-adams');
const thomasJefferson = require('./personalities/thomas-jefferson');
const abrahamLincoln = require('./personalities/abraham-lincoln');
const georgeMcClellan = require('./personalities/george-mcclellan');
const henryClay = require('./personalities/henry-clay');
const johnCCalhoun = require('./personalities/john-c-calhoun');
const henryJackson = require('./personalities/henry-jackson');
const andrewJackson = require('./personalities/andrew-jackson');
const franklinPierce = require('./personalities/franklin-pierce');
const dolleyMadison = require('./personalities/dolley-madison');
const mikePence = require('./personalities/mike-pence');
const georgeHWBush = require('./personalities/george-h-w-bush');
const danQuayle = require('./personalities/dan-quayle');

// Configure target user
const targetUser = 'libertybelltail';

// Operation mode
let operationMode = 'normal'; // 'normal' or 'reply_only'

// Configure bot instances
const allBots = [
    {
        id: 1,
        credentials: {
            username: process.env.TWITTER_USERNAME_GEORGE_WASHINGTON,
            password: process.env.TWITTER_PASSWORD_GEORGE_WASHINGTON,
            email: process.env.TWITTER_EMAIL_GEORGE_WASHINGTON
        },
        personality: georgeWashington
    },
    {
        id: 2,
        credentials: {
            username: process.env.TWITTER_USERNAME_JOHN_ADAMS,
            password: process.env.TWITTER_PASSWORD_JOHN_ADAMS,
            email: process.env.TWITTER_EMAIL_JOHN_ADAMS
        },
        personality: johnAdams
    },
    {
        id: 3,
        credentials: {
            username: process.env.TWITTER_USERNAME_THOMAS_JEFFERSON,
            password: process.env.TWITTER_PASSWORD_THOMAS_JEFFERSON,
            email: process.env.TWITTER_EMAIL_THOMAS_JEFFERSON
        },
        personality: thomasJefferson
    },
    {
        id: 4,
        credentials: {
            username: process.env.TWITTER_USERNAME_ABRAHAM_LINCOLN,
            password: process.env.TWITTER_PASSWORD_ABRAHAM_LINCOLN,
            email: process.env.TWITTER_EMAIL_ABRAHAM_LINCOLN
        },
        personality: abrahamLincoln
    },
    {
        id: 5,
        credentials: {
            username: process.env.TWITTER_USERNAME_GEORGE_B_MCCLELLAN,
            password: process.env.TWITTER_PASSWORD_GEORGE_B_MCCLELLAN,
            email: process.env.TWITTER_EMAIL_GEORGE_B_MCCLELLAN
        },
        personality: georgeMcClellan
    },
    {
        id: 6,
        credentials: {
            username: process.env.TWITTER_USERNAME_HENRY_CLAY,
            password: process.env.TWITTER_PASSWORD_HENRY_CLAY,
            email: process.env.TWITTER_EMAIL_HENRY_CLAY
        },
        personality: henryClay
    },
    {
        id: 7,
        credentials: {
            username: process.env.TWITTER_USERNAME_JOHN_C_CALHOUN,
            password: process.env.TWITTER_PASSWORD_JOHN_C_CALHOUN,
            email: process.env.TWITTER_EMAIL_JOHN_C_CALHOUN
        },
        personality: johnCCalhoun
    },
    {
        id: 8,
        credentials: {
            username: process.env.TWITTER_USERNAME_HENRY_M_JACKSON,
            password: process.env.TWITTER_PASSWORD_HENRY_M_JACKSON,
            email: process.env.TWITTER_EMAIL_HENRY_M_JACKSON
        },
        personality: henryJackson
    },
    {
        id: 9,
        credentials: {
            username: process.env.TWITTER_USERNAME_ANDREW_JACKSON,
            password: process.env.TWITTER_PASSWORD_ANDREW_JACKSON,
            email: process.env.TWITTER_EMAIL_ANDREW_JACKSON
        },
        personality: andrewJackson
    },
    {
        id: 10,
        credentials: {
            username: process.env.TWITTER_USERNAME_FRANKLIN_PIERCE,
            password: process.env.TWITTER_PASSWORD_FRANKLIN_PIERCE,
            email: process.env.TWITTER_EMAIL_FRANKLIN_PIERCE
        },
        personality: franklinPierce
    },
    {
        id: 11,
        credentials: {
            username: process.env.TWITTER_USERNAME_DOLLEY_MADISON,
            password: process.env.TWITTER_PASSWORD_DOLLEY_MADISON,
            email: process.env.TWITTER_EMAIL_DOLLEY_MADISON,
        },
        personality: dolleyMadison
    },
    {
        id: 12,
        credentials: {
            username: process.env.TWITTER_USERNAME_MIKE_PENCE,
            password: process.env.TWITTER_PASSWORD_MIKE_PENCE,
            email: process.env.TWITTER_EMAIL_MIKE_PENCE
        },
        personality: mikePence
    },
    {
        id: 13,
        credentials: {
            username: process.env.TWITTER_USERNAME_GEORGE_H_W_BUSH,
            password: process.env.TWITTER_PASSWORD_GEORGE_H_W_BUSH,
            email: process.env.TWITTER_EMAIL_GEORGE_H_W_BUSH
        },
        personality: georgeHWBush
    },
    {
        id: 14,
        credentials: {
            username: process.env.TWITTER_USERNAME_DAN_QUAYLE,
            password: process.env.TWITTER_PASSWORD_DAN_QUAYLE,
            email: process.env.TWITTER_EMAIL_DAN_QUAYLE
        },
        personality: danQuayle
    }
];

// Selected bots for the current cycle
let selectedBots = [];

// Extract all bot usernames
const allBotUsernames = allBots.map(bot => bot.credentials.username);

// Fisher-Yates shuffle algorithm
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Function to display character selection menu
function displayCharacterMenu() {
    console.log('\n============================================================================');
    console.log('                    Historical Twitter Bots - 캐릭터 선택');
    console.log('============================================================================\n');
    console.log('사이클에 포함할 캐릭터를 선택하세요:\n');
    
    allBots.forEach(bot => {
        console.log(`${bot.id}. ${bot.personality.name}`);
    });
    
    console.log('\nA. 모든 캐릭터 선택');
    console.log('\n사용법:');
    console.log('- 개별 선택: 번호를 쉼표로 구분하여 입력 (예: 1,3,5)');
    console.log('- 전체 선택: A 입력');
    console.log('- 선택 완료 후 Enter를 누르세요');
    console.log('\n============================================================================');
    console.log('선택: ');
}

// Function to handle user input for character selection
function selectCharacters() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        displayCharacterMenu();
        
        rl.question('', (answer) => {
            const input = answer.trim().toUpperCase();
            
            if (input === 'A') {
                selectedBots = [...allBots];
                console.log('\n✅ 모든 캐릭터가 선택되었습니다.');
            } else {
                const selectedIds = input.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
                selectedBots = allBots.filter(bot => selectedIds.includes(bot.id));
                
                if (selectedBots.length === 0) {
                    console.log('\n❌ 유효한 캐릭터가 선택되지 않았습니다. 모든 캐릭터를 기본으로 선택합니다.');
                    selectedBots = [...allBots];
                } else {
                    console.log('\n✅ 선택된 캐릭터:');
                    selectedBots.forEach(bot => {
                        console.log(`   - ${bot.personality.name}`);
                    });
                }
            }
            
            console.log(`\n총 ${selectedBots.length}명의 캐릭터가 사이클에 포함됩니다.\n`);
            rl.close();
            resolve();
        });
    });
}

// Function to display operation mode selection menu
function displayModeMenu() {
    console.log('\n============================================================================');
    console.log('                        운영 모드 선택');
    console.log('============================================================================\n');
    console.log('실행할 모드를 선택하세요:\n');
    console.log('1. 일반 모드 (트윗 게시 및 답글)');
    console.log('2. 답글 전용 모드 (답글만 작성)');
    console.log('\n============================================================================');
    console.log('선택 (1 또는 2): ');
}

// Function to handle user input for operation mode selection
function selectOperationMode() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        displayModeMenu();

        rl.question('', (answer) => {
            const input = answer.trim();
            if (input === '2') {
                operationMode = 'reply_only';
                console.log('\n✅ 답글 전용 모드가 선택되었습니다.');
            } else {
                operationMode = 'normal';
                console.log('\n✅ 일반 모드가 선택되었습니다.');
            }
            rl.close();
            resolve();
        });
    });
}

// Function to run selected bots
async function runSelectedBots() {
    console.log('트윗 사이클을 시작합니다...');
    
    try {
        // Create a shuffled copy of the selected bots array
        const shuffledBots = shuffleArray(selectedBots);
        console.log('이번 사이클의 봇 순서:', shuffledBots.map(bot => bot.personality.name).join(', '));
        
        for (const bot of shuffledBots) {
            try {
                const twitterBot = new TwitterBot(bot.credentials, bot.personality, allBotUsernames, targetUser);
                await twitterBot.run(operationMode);
                
                // Add random delay between bots (1-5 minutes) to avoid suspicious activity
                // const delay = Math.floor(Math.random() * (300000 - 60000) + 60000);
                // await new Promise(resolve => setTimeout(resolve, delay));
            } catch (error) {
                console.error(`${bot.personality.name} 봇 실행 중 오류:`, error);
                // Continue with next bot instead of stopping the entire cycle
            }
        }
    } catch (error) {
        console.error('트윗 사이클 중 치명적 오류:', error);
    } finally {
        console.log('트윗 사이클이 완료되었습니다.');
    }
}

// Main initialization function
async function initialize() {
    console.log('Historical Twitter Bots 초기화 중...');
    
    // Operation mode selection
    await selectOperationMode();
    
    // Character selection
    await selectCharacters();
    
    // Schedule tweets using cron
    const tweetSchedule = process.env.TWEET_FREQUENCY || '0 * * * *';  // Default to every hour
    cron.schedule(tweetSchedule, runSelectedBots);
    
    console.log('트윗 스케줄:', tweetSchedule);
    console.log('초기 실행을 시작합니다...\n');
    
    // Initial run
    await runSelectedBots();
}

// Start the application
initialize();

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n봇을 종료합니다...');
    process.exit();
});
