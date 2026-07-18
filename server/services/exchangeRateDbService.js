const BaseRepository = require('../utils/BaseRepository');
const logger = require('../utils/logger');

/**
 * Exchange Rate database service — manages exchange_rates table via Prisma.
 */
class ExchangeRateDbService extends BaseRepository {
    constructor(prisma) {
        super(prisma, 'exchange_rates');
    }

    async getAllExchangeRates() {
        try {
            return await this.findAll({ orderBy: { from_currency: 'asc' } });
        } catch (error) {
            logger.error('Failed to get all exchange rates:', error.message);
            throw error;
        }
    }

    async getExchangeRate(fromCurrency, toCurrency) {
        try {
            const from = fromCurrency.toUpperCase();
            const to   = toCurrency.toUpperCase();

            // Direct lookup
            let rate = await this.findOne({ from_currency: from, to_currency: to });
            if (rate) return rate;

            // Reverse lookup
            const reverseRate = await this.findOne({ from_currency: to, to_currency: from });
            if (reverseRate && reverseRate.rate !== 0) {
                return {
                    ...reverseRate,
                    from_currency: from,
                    to_currency:   to,
                    rate:          1 / Number(reverseRate.rate),
                    is_reverse:    true,
                };
            }

            return null;
        } catch (error) {
            logger.error(`Failed to get exchange rate ${fromCurrency}/${toCurrency}:`, error.message);
            throw error;
        }
    }

    async getRatesForCurrency(currency) {
        try {
            const currencyCode = currency.toUpperCase();
            const [fromRates, toRates] = await Promise.all([
                this.findAll({ filters: { from_currency: currencyCode }, orderBy: { to_currency: 'asc' } }),
                this.findAll({ filters: { to_currency: currencyCode },   orderBy: { from_currency: 'asc' } }),
            ]);
            return { fromRates, toRates, currency: currencyCode };
        } catch (error) {
            logger.error(`Failed to get rates for currency ${currency}:`, error.message);
            throw error;
        }
    }

    async upsertExchangeRate(fromCurrency, toCurrency, rate, source = 'manual') {
        try {
            const from = fromCurrency.toUpperCase();
            const to   = toCurrency.toUpperCase();
            this._validateExchangeRateData(from, to, rate);

            const existing = await this.prisma.exchangeRate.findUnique({
                where: { from_currency_to_currency: { from_currency: from, to_currency: to } },
                select: { id: true },
            });

            const result = await this.prisma.exchangeRate.upsert({
                where: {
                    from_currency_to_currency: { from_currency: from, to_currency: to },
                },
                update: { rate: parseFloat(rate), source },
                create: { from_currency: from, to_currency: to, rate: parseFloat(rate), source },
            });

            logger.info(`Upserted exchange rate ${from}/${to}: ${rate}`);
            return { ...result, operation: existing ? 'update' : 'create' };
        } catch (error) {
            logger.error(`Failed to upsert exchange rate ${fromCurrency}/${toCurrency}:`, error.message);
            throw error;
        }
    }

    async bulkUpsertExchangeRates(rates, source = 'api') {
        try {
            const results = { created: 0, updated: 0, errors: [] };

            await this.prisma.$transaction(async (tx) => {
                for (const rateData of rates) {
                    try {
                        const { from_currency, to_currency, rate } = rateData;
                        this._validateExchangeRateData(from_currency, to_currency, rate);

                        const from = from_currency.toUpperCase();
                        const to   = to_currency.toUpperCase();

                        const existing = await tx.exchangeRate.findUnique({
                            where: { from_currency_to_currency: { from_currency: from, to_currency: to } },
                        });

                        if (existing) {
                            await tx.exchangeRate.update({
                                where: { from_currency_to_currency: { from_currency: from, to_currency: to } },
                                data:  { rate: parseFloat(rate), source },
                            });
                            results.updated++;
                        } else {
                            await tx.exchangeRate.create({
                                data: { from_currency: from, to_currency: to, rate: parseFloat(rate), source },
                            });
                            results.created++;
                        }
                    } catch (error) {
                        results.errors.push({ rate: rateData, error: error.message });
                    }
                }
            });

            return results;
        } catch (error) {
            logger.error('Failed to bulk update exchange rates:', error.message);
            throw error;
        }
    }

    async deleteExchangeRate(fromCurrency, toCurrency) {
        try {
            const from = fromCurrency.toUpperCase();
            const to   = toCurrency.toUpperCase();

            const existing = await this.getExchangeRate(from, to);
            if (!existing) {
                throw new Error(`Exchange rate ${from}/${to} not found`);
            }

            const result = await this.delete(existing.id);
            logger.info(`Deleted exchange rate ${from}/${to}`);
            return result;
        } catch (error) {
            logger.error(`Failed to delete exchange rate ${fromCurrency}/${toCurrency}:`, error.message);
            throw error;
        }
    }

    async convertCurrency(amount, fromCurrency, toCurrency) {
        try {
            const from = fromCurrency.toUpperCase();
            const to   = toCurrency.toUpperCase();

            if (from === to) {
                return {
                    originalAmount:  amount,
                    convertedAmount: amount,
                    fromCurrency:    from,
                    toCurrency:      to,
                    rate:            1,
                    timestamp:       new Date().toISOString(),
                };
            }

            const exchangeRate = await this.getExchangeRate(from, to);
            if (!exchangeRate) {
                throw new Error(`Exchange rate not found for ${from}/${to}`);
            }

            const rate            = Number(exchangeRate.rate);
            const convertedAmount = amount * rate;

            return {
                originalAmount:  amount,
                convertedAmount: Math.round(convertedAmount * 100) / 100,
                fromCurrency:    from,
                toCurrency:      to,
                rate,
                timestamp:       new Date().toISOString(),
                rateUpdatedAt:   exchangeRate.updated_at,
            };
        } catch (error) {
            logger.error(`Failed to convert ${amount} ${fromCurrency} to ${toCurrency}:`, error.message);
            throw error;
        }
    }

    async getExchangeRateStats() {
        try {
            const allRates    = await this.getAllExchangeRates();
            const currencies  = new Set();
            const sources     = {};
            let oldestUpdate  = null;
            let newestUpdate  = null;

            allRates.forEach((rate) => {
                currencies.add(rate.from_currency);
                currencies.add(rate.to_currency);

                if (!sources[rate.source]) sources[rate.source] = 0;
                sources[rate.source]++;

                const t = new Date(rate.updated_at);
                if (!oldestUpdate || t < oldestUpdate) oldestUpdate = t;
                if (!newestUpdate || t > newestUpdate) newestUpdate = t;
            });

            return {
                totalRates:       allRates.length,
                uniqueCurrencies: currencies.size,
                currencies:       Array.from(currencies).sort(),
                sources,
                oldestUpdate:     oldestUpdate ? oldestUpdate.toISOString() : null,
                newestUpdate:     newestUpdate ? newestUpdate.toISOString() : null,
            };
        } catch (error) {
            logger.error('Failed to get exchange rate stats:', error.message);
            throw error;
        }
    }

    _validateExchangeRateData(fromCurrency, toCurrency, rate) {
        if (!fromCurrency || typeof fromCurrency !== 'string' || fromCurrency.length !== 3) {
            throw new Error('Invalid from_currency: must be a 3-character currency code');
        }
        if (!toCurrency || typeof toCurrency !== 'string' || toCurrency.length !== 3) {
            throw new Error('Invalid to_currency: must be a 3-character currency code');
        }
        if (fromCurrency === toCurrency) {
            throw new Error('from_currency and to_currency cannot be the same');
        }
        const rateNum = parseFloat(rate);
        if (isNaN(rateNum) || rateNum <= 0) {
            throw new Error('Invalid rate: must be a positive number');
        }
    }
}

module.exports = ExchangeRateDbService;
