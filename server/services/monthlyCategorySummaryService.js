const logger = require('../utils/logger');
const { getBaseCurrency } = require('../config/currencies');
const { getOrgId } = require('../lib/orgContext');

/**
 * Monthly Category Summary Service
 * Computes and stores monthly spending aggregates per category using Prisma + PostgreSQL.
 *
 * Constructor now receives the Prisma client directly instead of a dbPath.
 */
class MonthlyCategorySummaryService {
    constructor(prisma) {
        this.prisma      = prisma;
        this.baseCurrency = getBaseCurrency();
    }

    /**
     * Fetch exchange rate between two currencies.
     * Falls back to 1.0 if not found.
     */
    async getExchangeRate(fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return 1.0;

        // Direct lookup
        const direct = await this.prisma.exchangeRate.findUnique({
            where: { from_currency_to_currency: { from_currency: fromCurrency, to_currency: toCurrency } },
        });
        if (direct) return parseFloat(direct.rate);

        // Reverse lookup
        const reverse = await this.prisma.exchangeRate.findUnique({
            where: { from_currency_to_currency: { from_currency: toCurrency, to_currency: fromCurrency } },
        });
        if (reverse && Number(reverse.rate) !== 0) {
            return 1 / parseFloat(reverse.rate);
        }

        // Cross-rate via base currency
        const base = getBaseCurrency();
        if (fromCurrency !== base && toCurrency !== base) {
            const toBase   = await this.getExchangeRate(fromCurrency, base);
            const fromBase = await this.getExchangeRate(base, toCurrency);
            if (toBase !== 1.0 && fromBase !== 1.0) return toBase * fromBase;
        }

        logger.warn(`Exchange rate not found: ${fromCurrency} -> ${toCurrency}, using 1.0`);
        return 1.0;
    }

    /**
     * Recalculate and store the monthly category summary for a given year/month.
     */
    async updateMonthlyCategorySummary(year, month) {
        try {
            const monthStr  = month.toString().padStart(2, '0');
            const startDate = new Date(`${year}-${monthStr}-01`);
            const endDate   = new Date(year, month, 0); // Last day of month

            logger.info(`Updating monthly category summary for ${year}-${monthStr}`);

            // Fetch all succeeded payments in this month with subscription category info
            const payments = await this.prisma.paymentHistory.findMany({
                where: {
                    status:       'succeeded',
                    payment_date: { gte: startDate, lte: endDate },
                },
                include: {
                    subscription: {
                        include: { category: true },
                    },
                },
            });

            // Aggregate by category
            const categoryData = {};
            for (const payment of payments) {
                const categoryId = payment.subscription.category_id;
                if (!categoryData[categoryId]) {
                    categoryData[categoryId] = { totalAmount: 0, transactionCount: 0 };
                }
                const rate   = await this.getExchangeRate(payment.currency, this.baseCurrency);
                const amount = parseFloat(payment.amount_paid) * rate;
                categoryData[categoryId].totalAmount       += amount;
                categoryData[categoryId].transactionCount  += 1;
            }

            // Write to DB in a transaction
            await this.prisma.$transaction(async (tx) => {
                // Delete existing rows for this month
                await tx.monthlyCategorySummary.deleteMany({ where: { year, month } });

                // Insert new aggregated rows
                for (const [categoryIdStr, data] of Object.entries(categoryData)) {
                    await tx.monthlyCategorySummary.create({
                        data: {
                            year,
                            month,
                            category_id:                   parseInt(categoryIdStr),
                            total_amount_in_base_currency: Math.round(data.totalAmount * 100) / 100,
                            base_currency:                 this.baseCurrency,
                            transactions_count:            data.transactionCount,
                        },
                    });
                }
            });

            logger.info(`Updated monthly category summary for ${year}-${monthStr}: ${Object.keys(categoryData).length} categories`);
        } catch (error) {
            logger.error(`Failed to update monthly category summary for ${year}-${month}:`, error.message);
            throw error;
        }
    }

    /**
     * Recalculate all months that have payment records.
     */
    async recalculateAllMonthlyCategorySummaries() {
        try {
            logger.info('Starting recalculation of all monthly category summaries...');

            // Get distinct year/month combinations from payment_history
            const months = await this.prisma.$queryRaw`
                SELECT DISTINCT
                    EXTRACT(YEAR  FROM payment_date)::int AS year,
                    EXTRACT(MONTH FROM payment_date)::int AS month
                FROM payment_history
                WHERE status = 'succeeded' AND organization_id = ${getOrgId()}
                ORDER BY year, month
            `;

            // Clear existing summaries (even if no payment records remain)
            await this.prisma.monthlyCategorySummary.deleteMany({});

            if (months.length === 0) {
                logger.info('No payment records found for recalculation');
                return;
            }

            // Recalculate per month
            for (const { year, month } of months) {
                await this.updateMonthlyCategorySummary(Number(year), Number(month));
            }

            logger.info(`Recalculated monthly category summaries for ${months.length} months`);
        } catch (error) {
            logger.error('Failed to recalculate all monthly category summaries:', error.message);
            throw error;
        }
    }

    /**
     * Process a newly inserted payment — refresh its month's summary.
     */
    async processNewPayment(paymentId) {
        try {
            const payment = await this.prisma.paymentHistory.findUnique({
                where: { id: paymentId },
                select: { payment_date: true, status: true },
            });

            if (!payment || payment.status !== 'succeeded') {
                logger.warn(`Payment ${paymentId} not found or not succeeded`);
                return;
            }

            const date  = new Date(payment.payment_date);
            const year  = date.getFullYear();
            const month = date.getMonth() + 1;
            await this.updateMonthlyCategorySummary(year, month);
            logger.info(`Processed payment ${paymentId} for monthly category summary`);
        } catch (error) {
            logger.error(`Failed to process payment ${paymentId}:`, error.message);
            throw error;
        }
    }

    /**
     * Process deletion of a payment — refresh its month's summary.
     */
    async processPaymentDeletion(year, month) {
        try {
            await this.updateMonthlyCategorySummary(year, month);
            logger.info(`Processed payment deletion for ${year}-${month.toString().padStart(2, '0')}`);
        } catch (error) {
            logger.error(`Failed to process payment deletion for ${year}-${month}:`, error.message);
            throw error;
        }
    }

    /**
     * Get monthly category summaries for a date range.
     */
    async getMonthlyCategorySummary(startYear, startMonth, endYear, endMonth) {
        return await this.prisma.monthlyCategorySummary.findMany({
            where: {
                OR: [
                    { year: { gt: startYear } },
                    { year: startYear, month: { gte: startMonth } },
                ],
                AND: [
                    {
                        OR: [
                            { year: { lt: endYear } },
                            { year: endYear, month: { lte: endMonth } },
                        ],
                    },
                ],
            },
            include: { category: true },
            orderBy: [{ year: 'asc' }, { month: 'asc' }],
        });
    }

    /**
     * Get category summary for a specific month.
     */
    async getMonthCategorySummary(year, month) {
        return await this.prisma.monthlyCategorySummary.findMany({
            where: { year, month },
            include: { category: true },
            orderBy: { total_amount_in_base_currency: 'desc' },
        });
    }

    /**
     * Get aggregate total for a date range.
     */
    async getTotalSummary(startYear, startMonth, endYear, endMonth) {
        const result = await this.prisma.monthlyCategorySummary.aggregate({
            where: {
                OR: [
                    { year: { gt: startYear } },
                    { year: startYear, month: { gte: startMonth } },
                ],
                AND: [
                    {
                        OR: [
                            { year: { lt: endYear } },
                            { year: endYear, month: { lte: endMonth } },
                        ],
                    },
                ],
            },
            _sum: {
                total_amount_in_base_currency: true,
                transactions_count:            true,
            },
        });

        return {
            total_amount:        result._sum.total_amount_in_base_currency,
            total_transactions:  result._sum.transactions_count,
            base_currency:       this.baseCurrency,
        };
    }

    // Kept for API compatibility — Prisma manages connection lifecycle
    close() {}
}

module.exports = MonthlyCategorySummaryService;
