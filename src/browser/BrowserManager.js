const puppeteer = require('puppeteer');
const Utilities = require('../utils/Utilities');

class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init(baseDir) {
        const profileDir = Utilities.createChromePrefs(baseDir);

        this.browser = await puppeteer.launch({
            headless: false,
            defaultViewport: { width: 1280, height: 800 },
            args: [
                `--user-data-dir=${profileDir}`,
                '--lang=en-US',
                '--no-sandbox',
                '--disable-translate',
                '--disable-translate-script-url',
                '--disable-sync',
                '--disable-auto-translate',
                '--disable-client-side-phishing-detection'
            ]
        });

        this.page = await this.browser.newPage();

        // Set language preferences
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9'
        });

        // Override language settings
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'language', {
                get: function () { return 'en-US'; }
            });
            Object.defineProperty(navigator, 'languages', {
                get: function () { return ['en-US', 'en']; }
            });
        });

        return this.page;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    getPage() {
        return this.page;
    }
}

module.exports = BrowserManager;
