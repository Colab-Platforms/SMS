const axios = require('axios');
const logger = require('../utils/logger');
const { SUPPORTED_CURRENCY_CODES, getBaseCurrency } = require('../config/currencies');

/**
 * Exchange rate API service — fetches live rates from Frankfurter
 * (ECB reference rates, no API key required): https://frankfurter.dev
 */
class ExchangeRateApiService {
    constructor() {
        this.baseUrl = 'https://api.frankfurter.dev/v1/latest';
        this.supportedCurrencies = SUPPORTED_CURRENCY_CODES;
    }

    /**
     * Fetch all supported currency rates relative to the base currency in a single request.
     * @returns {Promise<Array>} rates
     */
    async getAllExchangeRates() {
        const baseCurrency = getBaseCurrency();
        const symbols = this.supportedCurrencies.filter((currency) => currency !== baseCurrency);

        const rates = [
            { from_currency: baseCurrency, to_currency: baseCurrency, rate: 1.0 },
        ];

        if (symbols.length === 0) {
            return rates;
        }

        try {
            const response = await axios.get(this.baseUrl, {
                params: { base: baseCurrency, symbols: symbols.join(',') },
                timeout: 10000,
            });

            const fetchedRates = response.data?.rates || {};

            for (const currency of symbols) {
                if (fetchedRates[currency] === undefined) {
                    logger.warn(`Frankfurter did not return a rate for ${baseCurrency} -> ${currency}`);
                    continue;
                }
                rates.push({
                    from_currency: baseCurrency,
                    to_currency: currency,
                    rate: Number(fetchedRates[currency]),
                });
            }
        } catch (error) {
            const message = error.response
                ? `Frankfurter API request failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`
                : error.request
                    ? 'Network error: unable to reach Frankfurter API'
                    : `Exchange rate service error: ${error.message}`;
            logger.error(message);
        }

        return rates;
    }
}

module.exports = ExchangeRateApiService;
