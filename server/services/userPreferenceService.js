const prisma = require('../lib/prisma');
const { getBaseCurrency } = require('../config/currencies');

/**
 * User Preference Service
 * Manages user language preferences and other settings via Prisma.
 */
class UserPreferenceService {
    constructor(prismaClient = null) {
        // Accept injected prisma or fall back to singleton
        this.prisma = prismaClient || prisma;
    }

    /**
     * Get user language preference.
     */
    async getUserLanguage() {
        try {
            const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
            if (!settings) return 'zh_CN';
            return settings.language;
        } catch (error) {
            console.error('Error getting user language:', error);
            return 'zh_CN';
        }
    }

    /**
     * Set user language preference.
     */
    async setUserLanguage(language) {
        try {
            const supportedLanguages = ['zh_CN', 'en', 'ja', 'ko', 'fr', 'de', 'es'];
            // Also accept dash-separated form from frontend
            const normalised = language.replace('-', '_');
            if (!supportedLanguages.includes(normalised)) {
                throw new Error(`Unsupported language: ${language}`);
            }

            await this.prisma.settings.upsert({
                where:  { id: 1 },
                update: { language: normalised },
                create: {
                    id:                    1,
                    language:              normalised,
                    currency:              getBaseCurrency(),
                    theme:                 'system',
                    show_original_currency: true,
                },
            });

            console.log(`User language preference updated to: ${normalised}`);
            return true;
        } catch (error) {
            console.error('Error setting user language:', error);
            return false;
        }
    }

    /**
     * Get all user preferences (settings row).
     */
    async getUserPreferences(userId = 1) {
        try {
            const result = await this.prisma.settings.findUnique({ where: { id: userId } });
            if (!result) {
                return {
                    id:                    userId,
                    currency:              getBaseCurrency(),
                    theme:                 'system',
                    show_original_currency: true,
                    language:              'zh_CN',
                };
            }
            return result;
        } catch (error) {
            console.error('Error getting user preferences:', error);
            return {
                id:                    userId,
                currency:              getBaseCurrency(),
                theme:                 'system',
                show_original_currency: true,
                language:              'zh_CN',
            };
        }
    }

    /**
     * Update user preferences.
     */
    async updateUserPreferences(preferences, userId = 1) {
        try {
            const allowedFields = ['currency', 'theme', 'show_original_currency', 'language'];
            const updateData    = {};

            for (const [key, value] of Object.entries(preferences)) {
                if (allowedFields.includes(key)) {
                    // Normalise language code
                    if (key === 'language') {
                        updateData[key] = String(value).replace('-', '_');
                    } else if (key === 'show_original_currency') {
                        updateData[key] = Boolean(value);
                    } else {
                        updateData[key] = value;
                    }
                }
            }

            if (Object.keys(updateData).length === 0) {
                throw new Error('No valid fields to update');
            }

            await this.prisma.settings.upsert({
                where:  { id: userId },
                update: updateData,
                create: {
                    id:                    userId,
                    currency:              preferences.currency              || getBaseCurrency(),
                    theme:                 preferences.theme                 || 'system',
                    show_original_currency: preferences.show_original_currency !== undefined ? Boolean(preferences.show_original_currency) : true,
                    language:              (preferences.language || 'zh_CN').replace('-', '_'),
                },
            });

            console.log('User preferences updated successfully');
            return true;
        } catch (error) {
            console.error('Error updating user preferences:', error);
            return false;
        }
    }

    getSupportedLanguages() {
        return [
            { code: 'zh_CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
            { code: 'en',    name: 'English',              nativeName: 'English' },
            { code: 'ja',    name: 'Japanese',             nativeName: '日本語' },
            { code: 'ko',    name: 'Korean',               nativeName: '한국어' },
            { code: 'fr',    name: 'French',               nativeName: 'Français' },
            { code: 'de',    name: 'German',               nativeName: 'Deutsch' },
            { code: 'es',    name: 'Spanish',              nativeName: 'Español' },
        ];
    }

    getLanguageName(langCode) {
        const norm      = langCode.replace('-', '_');
        const languages = this.getSupportedLanguages();
        const language  = languages.find((l) => l.code === norm);
        return language ? language.name : langCode;
    }

    validateLanguageCode(langCode) {
        const norm          = langCode.replace('-', '_');
        const supportedCodes = this.getSupportedLanguages().map((l) => l.code);
        return supportedCodes.includes(norm);
    }
}

module.exports = UserPreferenceService;
