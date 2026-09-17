const BaseRepository = require('../utils/BaseRepository');
const logger = require('../utils/logger');
const { SUPPORTED_CURRENCIES, isSupportedCurrency, getBaseCurrency } = require('../config/currencies');
const { getOrgId } = require('../lib/orgContext');

/**
 * Settings service — manages the current company's settings row (one row per organization).
 */
class SettingsService extends BaseRepository {
    constructor(prisma) {
        super(prisma, 'settings');
    }

    /**
     * Get application settings (always returns something — seeds defaults if missing).
     */
    async getSettings() {
        try {
            const settings = await this.prisma.settings.findFirst({});
            return settings || this._getDefaultSettings();
        } catch (error) {
            logger.error('Failed to get settings:', error.message);
            throw error;
        }
    }

    /**
     * Update application settings using upsert (creates if doesn't exist).
     */
    async updateSettings(updateData) {
        try {
            this._validateUpdateData(updateData);

            const updates = {};
            if (updateData.currency !== undefined)               updates.currency = updateData.currency;
            if (updateData.theme !== undefined)                  updates.theme = updateData.theme;
            if (updateData.show_original_currency !== undefined) updates.show_original_currency = Boolean(updateData.show_original_currency);
            if (updateData.language !== undefined)               updates.language = updateData.language;

            if (Object.keys(updates).length === 0) {
                throw new Error('No update fields provided');
            }

            const organizationId = getOrgId();
            const defaults = this._getDefaultSettings();
            return await this.prisma.settings.upsert({
                where: { organization_id: organizationId },
                update: updates,
                create: { organization_id: organizationId, ...defaults, ...updates },
            });
        } catch (error) {
            logger.error('Failed to update settings:', error.message);
            throw error;
        }
    }

    /**
     * Reset settings to default values.
     */
    async resetSettings() {
        try {
            const organizationId = getOrgId();
            const defaults = this._getDefaultSettings();
            const result = await this.prisma.settings.upsert({
                where:  { organization_id: organizationId },
                update: defaults,
                create: { organization_id: organizationId, ...defaults },
            });
            logger.info('Settings reset to default values');
            return result;
        } catch (error) {
            logger.error('Failed to reset settings:', error.message);
            throw error;
        }
    }

    validateCurrency(currency) { return isSupportedCurrency(currency); }

    validateTheme(theme) {
        return ['light', 'dark', 'system'].includes(theme);
    }

    validateShowOriginalCurrency(v) {
        return typeof v === 'boolean' || v === 0 || v === 1;
    }

    getSupportedCurrencies() { return SUPPORTED_CURRENCIES; }

    getSupportedThemes() {
        return [
            { value: 'light',  label: 'Light Theme',    description: 'Light color scheme' },
            { value: 'dark',   label: 'Dark Theme',     description: 'Dark color scheme' },
            { value: 'system', label: 'System Default', description: 'Follow system preference' },
        ];
    }

    _getDefaultSettings() {
        return {
            currency:               getBaseCurrency(),
            theme:                  'system',
            show_original_currency: true,
            language:               'zh_CN',
        };
    }

    _validateUpdateData(updateData) {
        if (updateData.currency && !this.validateCurrency(updateData.currency)) {
            throw new Error(`Invalid currency: ${updateData.currency}`);
        }
        if (updateData.theme && !this.validateTheme(updateData.theme)) {
            throw new Error(`Invalid theme: ${updateData.theme}`);
        }
        if (updateData.show_original_currency !== undefined && !this.validateShowOriginalCurrency(updateData.show_original_currency)) {
            throw new Error(`Invalid show_original_currency value: ${updateData.show_original_currency}`);
        }
    }
}

module.exports = SettingsService;
