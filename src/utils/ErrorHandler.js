const path = require('path');

class ErrorHandler {
    constructor(page, personality) {
        this.page = page;
        this.personality = personality;
    }

    async takeErrorScreenshot(prefix) {
        try {
            const errorPath = path.join(process.cwd(), 'errors', `${prefix}-${Date.now()}.png`);
            await this.page.screenshot({ path: errorPath, fullPage: true });
            console.log(`${this.personality.name}: Saved error screenshot to ${errorPath}`);
        } catch (screenshotError) {
            console.error('Failed to save error screenshot:', screenshotError);
        }
    }

    async handleError(error, operation) {
        console.error(`${operation} failed for ${this.personality.name}:`, error);
        await this.takeErrorScreenshot(`${operation.toLowerCase()}-error`);
        throw error;
    }
}

module.exports = ErrorHandler;
