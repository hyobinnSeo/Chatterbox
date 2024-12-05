# Historical Twitter Bots

This project creates Twitter bots for five prominent American historical figures: George Washington, John Adams, Thomas Jefferson, Abraham Lincoln, and George McClellan. The bots use OpenAI's GPT model to generate historically accurate tweets about their daily lives and thoughts, posting regularly.

## Features

- Automated Twitter interaction using Puppeteer for browser automation
- Historically accurate content generation using OpenAI GPT
- Distinct personalities for each historical figure
- Tweet and reply functionality
- Sophisticated error handling and logging
- Browser session management
- Authentication handling
- Utility functions for common operations

## Prerequisites

- Node.js (v14 or higher)
- Twitter accounts for each historical figure
- OpenAI API key

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Configure your `.env` file with:
   - Twitter credentials for each account
   - OpenAI API key
   - Other configuration settings

## Environment Variables

```env
# Twitter Credentials
TWITTER_USERNAME_GEORGE_WASHINGTON=your_washington_username
TWITTER_PASSWORD_GEORGE_WASHINGTON=your_washington_password
TWITTER_USERNAME_JOHN_ADAMS=your_adams_username
TWITTER_PASSWORD_JOHN_ADAMS=your_adams_password
TWITTER_USERNAME_THOMAS_JEFFERSON=your_jefferson_username
TWITTER_PASSWORD_THOMAS_JEFFERSON=your_jefferson_password
TWITTER_USERNAME_ABRAHAM_LINCOLN=your_lincoln_username
TWITTER_PASSWORD_ABRAHAM_LINCOLN=your_lincoln_password
TWITTER_USERNAME_GEORGE_MCCLELLAN=your_mcclellan_username
TWITTER_PASSWORD_GEORGE_MCCLELLAN=your_mcclellan_password

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key
```

## Project Structure

```
├── src/
│   ├── auth/
│   │   └── Authentication.js
│   ├── browser/
│   │   └── BrowserManager.js
│   ├── tweets/
│   │   ├── TweetOperations.js
│   │   └── ReplyOperations.js
│   ├── utils/
│   │   ├── ErrorHandler.js
│   │   └── Utilities.js
│   └── TwitterBot.js
├── personalities/
│   ├── george-washington.js
│   ├── john-adams.js
│   ├── thomas-jefferson.js
│   ├── abraham-lincoln.js
│   └── george-mcclellan.js
├── errors/
├── chrome-profile/
├── index.js
├── .env
└── README.md
```

## Core Components

- **TwitterBot.js**: Main bot implementation handling core functionality
- **Authentication.js**: Manages Twitter login and session handling
- **BrowserManager.js**: Controls browser automation with Puppeteer
- **TweetOperations.js**: Handles tweet creation and posting
- **ReplyOperations.js**: Manages reply functionality
- **ErrorHandler.js**: Provides robust error handling and logging
- **Utilities.js**: Common utility functions
- **Personality Files**: Individual configuration and prompts for each historical figure

## Running the Bots

Start the bots with:
```bash
node index.js
```

The bots will:
1. Initialize browser sessions
2. Authenticate with Twitter
3. Generate historically accurate content using GPT
4. Post tweets and interact with other users
5. Handle errors and maintain logs

## Personality Customization

Each historical figure's personality is defined in their respective file under the `personalities/` directory. You can modify:
- Character traits and mannerisms
- Writing style and tone
- Topics of interest and expertise
- GPT prompt engineering parameters

## Safety Features

- Sophisticated error handling and recovery
- Browser session management
- Detailed logging system
- Graceful shutdown handling

## Note

This project is for educational purposes. Be sure to comply with Twitter's terms of service and API usage guidelines.

## License

MIT License
