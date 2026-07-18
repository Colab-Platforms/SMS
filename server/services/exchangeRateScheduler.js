const cron = require('node-cron');
const ExchangeRateApiService = require('./exchangeRateService');
const logger = require('../utils/logger');

/**
 * Exchange Rate Scheduler — Prisma version.
 * Periodically fetches live exchange rates and upserts them into PostgreSQL.
 */
class ExchangeRateScheduler {
    constructor(prisma, apiKey) {
        this.prisma              = prisma;
        this.exchangeRateService = new ExchangeRateApiService(apiKey);
        this.isRunning           = false;
        this.task                = null;
    }

    /**
     * Start the daily cron job (runs at 2:00 AM CST).
     */
    start() {
        if (this.isRunning) {
            logger.info('Exchange rate scheduler is already running');
            return;
        }

        this.task = cron.schedule('0 2 * * *', async () => {
            await this.updateExchangeRates();
        }, {
            scheduled: false,
            timezone:  'Asia/Shanghai',
        });

        this.task.start();
        this.isRunning = true;
        logger.info('Exchange rate scheduler started (daily at 2:00 AM CST)');

        // Fetch immediately on startup if data is stale
        this.checkAndUpdateIfNeeded();
    }

    stop() {
        if (this.task) {
            this.task.stop();
            this.task = null;
        }
        this.isRunning = false;
        logger.info('Exchange rate scheduler stopped');
    }

    /**
     * Update rates if none exist or last update was >24 hours ago.
     */
    async checkAndUpdateIfNeeded() {
        try {
            const result = await this.prisma.exchangeRate.findFirst({
                orderBy: { updated_at: 'desc' },
                select:  { updated_at: true },
            });

            const now            = new Date();
            const lastUpdateDate = result?.updated_at ? new Date(result.updated_at) : null;

            if (!lastUpdateDate || (now - lastUpdateDate) > 24 * 60 * 60 * 1000) {
                await this.updateExchangeRates();
            }
        } catch (error) {
            logger.error('Error checking exchange rate update status:', error.message);
        }
    }

    /**
     * Fetch latest rates from the external API and persist them.
     */
    async updateExchangeRates() {
        try {
            const rates = await this.exchangeRateService.getAllExchangeRates();

            if (rates.length === 0) {
                logger.warn('No exchange rates received from API');
                return { success: false, message: 'No rates received' };
            }

            const updateCount = await this.updateRatesInDatabase(rates);

            return {
                success:   true,
                message:   `Updated ${updateCount} exchange rates`,
                updatedAt: new Date().toISOString(),
            };
        } catch (error) {
            logger.error('Failed to update exchange rates:', error.message);
            return { success: false, message: error.message };
        }
    }

    /**
     * Upsert rates into the exchange_rates table via Prisma.
     * @param {Array} rates
     * @returns {number} number of records upserted
     */
    async updateRatesInDatabase(rates) {
        let count = 0;

        await this.prisma.$transaction(
            rates.map((rate) =>
                this.prisma.exchangeRate.upsert({
                    where: {
                        from_currency_to_currency: {
                            from_currency: rate.from_currency,
                            to_currency:   rate.to_currency,
                        },
                    },
                    update: { rate: rate.rate, updated_at: new Date() },
                    create: {
                        from_currency: rate.from_currency,
                        to_currency:   rate.to_currency,
                        rate:          rate.rate,
                    },
                })
            )
        );

        count = rates.length;
        return count;
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            nextRun:   this.task ? this.task.nextDate() : null,
            hasApiKey: !!this.exchangeRateService.apiKey,
        };
    }
}

module.exports = ExchangeRateScheduler;
