# Historical Twitter Bots

This project creates Twitter bots for three American Founding Fathers: George Washington, John Adams, and Thomas Jefferson. The bots use OpenAI's GPT model to generate historically accurate tweets about their daily lives and thoughts, posting every hour.

## Features

- Automated Twitter posting using Puppeteer
- Historically accurate content generation using OpenAI GPT
- Distinct personalities for each historical figure
- Scheduled tweets using node-cron
- Random delays between posts to avoid detection

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
   - Desired tweet frequency (default: hourly)

## Environment Variables

```env
# Twitter Credentials
TWITTER_USERNAME_GEORGE_WASHINGTON=your_washington_username
TWITTER_PASSWORD_GEORGE_WASHINGTON=your_washington_password
TWITTER_USERNAME_JOHN_ADAMS=your_adams_username
TWITTER_PASSWORD_JOHN_ADAMS=your_adams_password
TWITTER_USERNAME_THOMAS_JEFFERSON=your_jefferson_username
TWITTER_PASSWORD_THOMAS_JEFFERSON=your_jefferson_password

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key

# Tweet Frequency (in cron format)
TWEET_FREQUENCY="0 * * * *"  # Every hour
```

## Project Structure

```
├── personalities/
│   ├── george-washington.js
│   ├── john-adams.js
│   └── thomas-jefferson.js
├── bot.js
├── index.js
├── .env
└── README.md
```

## Running the Bots

Start the bots with:
```bash
node index.js
```

The bots will:
1. Initialize and log in to their respective Twitter accounts
2. Generate historically accurate tweets using GPT
3. Post tweets on the scheduled interval
4. Add random delays between posts to appear more natural

## Personality Customization

Each historical figure's personality is defined in their respective file under the `personalities/` directory. You can modify:
- Characteristics
- Writing style
- Topics of interest
- Prompt engineering for GPT

## Safety Features

- Random delays between posts to avoid suspicious activity
- Non-headless browser mode for monitoring
- Error handling and logging
- Graceful shutdown handling

## Note

This project is for educational purposes. Be sure to comply with Twitter's terms of service and API usage guidelines.

## License

MIT License
