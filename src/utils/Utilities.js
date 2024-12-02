const fs = require('fs');
const path = require('path');

class Utilities {
    static async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static createChromePrefs(baseDir) {
        const profileDir = path.join(baseDir, 'chrome-profile');
        if (!fs.existsSync(profileDir)) {
            fs.mkdirSync(profileDir, { recursive: true });
        }

        const prefsPath = path.join(profileDir, 'Preferences');
        const prefs = {
            "intl": {
                "accept_languages": "en-US,en",
                "selected_languages": "en-US,en"
            },
            "translate": {
                "enabled": false
            },
            "translate_site_blacklist": ["twitter.com"],
            "browser": {
                "enabled_labs_experiments": ["disable-auto-translate"],
                "check_default_browser": false
            },
            "profile": {
                "content_settings": {
                    "exceptions": {
                        "translate_site_blacklist": {
                            "twitter.com,*": {
                                "setting": 1
                            }
                        }
                    }
                }
            }
        };

        fs.writeFileSync(prefsPath, JSON.stringify(prefs));
        return profileDir;
    }
}

module.exports = Utilities;
