# Historical Twitter Bots

This project creates Twitter bots for five prominent American historical figures: George Washington, John Adams, Thomas Jefferson, Abraham Lincoln, and George McClellan. The bots use Google's Gemini Pro 1.5 model through OpenRouter to generate historically accurate tweets and engage in meaningful conversations.

## Features

- Sophisticated Twitter automation using Puppeteer
- Historically accurate content generation using Gemini Pro 1.5
- Complex interaction patterns:
  - Timeline monitoring and responses
  - Direct user engagement through notifications
  - Bot-to-bot conversations with thread depth management
  - Duplicate reply prevention
- Distinct personalities for each historical figure
- Robust error handling and recovery
- Browser session management
- Clean content processing (removes hashtags, mentions, etc.)

## Prerequisites

- Node.js (v14 or higher)
- Twitter accounts for each historical figure
- OpenRouter API key
- Chrome/Chromium browser

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
4. Configure your `.env` file with the required credentials

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

# OpenRouter API Key
OPENROUTER_API_KEY=your_openrouter_api_key

# Target User for Interactions (optional)
TARGET_USER=username_to_interact_with
```

## Project Structure

```
├── src/
│   ├── auth/
│   │   └── Authentication.js      # Handles Twitter authentication
│   ├── browser/
│   │   └── BrowserManager.js      # Manages Puppeteer browser sessions
│   ├── tweets/
│   │   ├── TweetOperations.js     # Handles tweet creation and posting
│   │   └── ReplyOperations.js     # Manages reply functionality
│   ├── utils/
│   │   ├── ErrorHandler.js        # Error handling and recovery
│   │   └── Utilities.js           # Common utility functions
│   └── TwitterBot.js              # Core bot implementation
├── personalities/                  # Historical figure configurations
│   ├── george-washington.js
│   ├── john-adams.js
│   ├── thomas-jefferson.js
│   ├── abraham-lincoln.js
│   └── george-mcclellan.js
├── errors/                        # Error logs directory
├── chrome-profile/               # Browser session data
└── index.js                      # Application entry point
```

## Bot Workflow

Each bot follows a sophisticated workflow:

1. **Authentication**
   - Secure login to Twitter account
   - Session management

2. **Timeline Monitoring**
   - Reads and analyzes tweets from Following tab
   - Processes tweet context for relevant responses

3. **Interaction Patterns**
   - Replies to notifications from specific users
   - Engages with other historical bots
   - Maintains conversation threads
   - Prevents duplicate replies

4. **Content Generation**
   - Uses Gemini Pro 1.5 for historically accurate responses
   - Considers conversation context
   - Maintains character authenticity
   - Enforces Twitter's character limits

5. **Content Processing**
   - Removes hashtags and mentions
   - Enforces character limits
   - Cleans up formatting

## Running the Bots

Start the bots with:
```bash
node index.js
```

The bots will:
1. Initialize browser sessions
2. Authenticate with Twitter
3. Process notifications and timeline
4. Generate and post content
5. Engage in conversations
6. Handle errors and maintain logs

## Personality Customization

Each historical figure's personality is defined in their respective file under `personalities/`. You can customize:
- Character traits and mannerisms
- Writing style and tone
- Topics of interest
- Response patterns for different scenarios
- Interaction guidelines

## Safety Features

- Thread depth management to prevent infinite conversations
- Duplicate reply prevention
- Rate limiting through natural delays
- Error recovery mechanisms
- Session management
- Content cleaning and validation

## Note

This project is for educational purposes. Be sure to comply with Twitter's terms of service and API usage guidelines.

## License

MIT License
