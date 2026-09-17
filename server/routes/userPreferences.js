const express = require('express');
const router = express.Router();
const UserPreferenceService = require('../services/userPreferenceService');

const userPreferenceService = new UserPreferenceService();

/**
 * GET /api/user-preferences
 * Get the current company's preferences
 */
router.get('/', async (req, res) => {
    try {
        const preferences = await userPreferenceService.getUserPreferences();

        res.json({
            success: true,
            data: preferences
        });
    } catch (error) {
        console.error('Error getting user preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user preferences',
            error: error.message
        });
    }
});

/**
 * PUT /api/user-preferences
 * Update the current company's preferences
 */
router.put('/', async (req, res) => {
    try {
        const preferences = req.body.preferences;

        if (!preferences || typeof preferences !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Invalid preferences data'
            });
        }

        const success = await userPreferenceService.updateUserPreferences(preferences);

        if (success) {
            const updatedPreferences = await userPreferenceService.getUserPreferences();
            res.json({
                success: true,
                message: 'User preferences updated successfully',
                data: updatedPreferences
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to update user preferences'
            });
        }
    } catch (error) {
        console.error('Error updating user preferences:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user preferences',
            error: error.message
        });
    }
});

/**
 * GET /api/user-preferences/language
 * Get the current company's language preference
 */
router.get('/language', async (req, res) => {
    try {
        const language = await userPreferenceService.getUserLanguage();

        res.json({
            success: true,
            data: {
                language: language,
                languageName: userPreferenceService.getLanguageName(language)
            }
        });
    } catch (error) {
        console.error('Error getting user language:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user language',
            error: error.message
        });
    }
});

/**
 * PUT /api/user-preferences/language
 * Set the current company's language preference
 */
router.put('/language', async (req, res) => {
    try {
        const { language } = req.body;

        if (!language) {
            return res.status(400).json({
                success: false,
                message: 'Language code is required'
            });
        }

        // Validate language code
        if (!userPreferenceService.validateLanguageCode(language)) {
            return res.status(400).json({
                success: false,
                message: 'Unsupported language code',
                supportedLanguages: userPreferenceService.getSupportedLanguages()
            });
        }

        const success = await userPreferenceService.setUserLanguage(language);

        if (success) {
            res.json({
                success: true,
                message: 'Language preference updated successfully',
                data: {
                    language: language,
                    languageName: userPreferenceService.getLanguageName(language)
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to update language preference'
            });
        }
    } catch (error) {
        console.error('Error setting user language:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set user language',
            error: error.message
        });
    }
});

/**
 * GET /api/user-preferences/supported-languages
 * Get supported languages
 */
router.get('/supported-languages', async (req, res) => {
    try {
        const languages = userPreferenceService.getSupportedLanguages();

        res.json({
            success: true,
            data: languages
        });
    } catch (error) {
        console.error('Error getting supported languages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get supported languages',
            error: error.message
        });
    }
});

module.exports = router;
