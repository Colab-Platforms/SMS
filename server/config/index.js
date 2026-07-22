const path = require('path');

/**
 * Unified configuration management module.
 * SQLite-specific helpers (getDatabasePath, ensureDatabaseDir, databaseExists)
 * have been removed — schema is now managed by Prisma Migrate + NeonDB.
 */
class Config {
    constructor() {
        this.loadEnvironmentVariables();
    }

    /**
     * Load environment variables from root .env file
     */
    loadEnvironmentVariables() {
        const envPath = path.join(__dirname, '..', '..', '.env');
        require('dotenv').config({ path: envPath });
    }

    /**
     * Get application port
     * @returns {number}
     */
    getPort() {
        return parseInt(process.env.PORT) || 3001;
    }

    /**
     * Get base currency
     * @returns {string}
     */
    getBaseCurrency() {
        return process.env.BASE_CURRENCY || 'CNY';
    }

    /**
     * Get log level
     * @returns {string}
     */
    getLogLevel() {
        const defaultLevel = this.isProduction() ? 'warn' : 'info';
        return process.env.LOG_LEVEL || defaultLevel;
    }

    /**
     * Get NODE_ENV
     * @returns {string}
     */
    getNodeEnv() {
        return process.env.NODE_ENV || 'development';
    }

    isDevelopment() { return this.getNodeEnv() === 'development'; }
    isProduction()  { return this.getNodeEnv() === 'production'; }
    isTest()        { return this.getNodeEnv() === 'test'; }

    /**
     * Configuration summary for logging
     * @returns {Object}
     */
    getSummary() {
        return {
            nodeEnv:        this.getNodeEnv(),
            port:           this.getPort(),
            database:       'NeonDB (PostgreSQL via Prisma)',
            logLevel:       this.getLogLevel(),
            baseCurrency:   this.getBaseCurrency(),
            emailConfigured: this.getEmailConfig().enabled,
        };
    }

    printSummary() {
        const s = this.getSummary();
        console.log('📋 Configuration Summary:');
        console.log(`   Environment:    ${s.nodeEnv}`);
        console.log(`   Port:           ${s.port}`);
        console.log(`   Database:       ${s.database}`);
        console.log(`   Log Level:      ${s.logLevel}`);
        console.log(`   Base Currency:  ${s.baseCurrency}`);
        console.log(`   Email:          ${s.emailConfigured ? '✅ Enabled' : '❌ Disabled'}`);
    }

    /**
     * Email notification configuration (Resend API)
     * @returns {Object}
     */
    getEmailConfig() {
        const apiKey  = process.env.RESEND_API_KEY;
        const from    = process.env.EMAIL_FROM || 'no-reply@example.com';
        const enabled = Boolean(apiKey && from);

        return {
            enabled, apiKey, from,
            locale: process.env.EMAIL_LOCALE || 'zh-CN',
        };
    }
}

const config = new Config();
module.exports = config;
