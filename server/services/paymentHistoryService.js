const BaseRepository = require('../utils/BaseRepository');
const MonthlyCategorySummaryService = require('./monthlyCategorySummaryService');
const logger = require('../utils/logger');
const { NotFoundError } = require('../middleware/errorHandler');

/**
 * Payment History Service — manages payment_history table via Prisma + PostgreSQL.
 */
class PaymentHistoryService extends BaseRepository {
    constructor(prisma) {
        super(prisma, 'payment_history');
        this.monthlyCategorySummaryService = new MonthlyCategorySummaryService(prisma);
    }

    /**
     * Get payment history with optional filters and pagination.
     */
    async getPaymentHistory(filters = {}, options = {}) {
        const where = {};
        if (filters.subscription_id) where.subscription_id = filters.subscription_id;
        if (filters.status)          where.status          = filters.status;
        if (filters.currency)        where.currency        = filters.currency;

        // Date range
        if (filters.start_date || filters.end_date) {
            where.payment_date = {};
            if (filters.start_date) where.payment_date.gte = new Date(filters.start_date);
            if (filters.end_date)   where.payment_date.lte = new Date(filters.end_date);
        }

        const args = {
            where,
            include: { subscription: { select: { name: true, plan: true } } },
            orderBy: [{ payment_date: 'desc' }, { id: 'desc' }],
        };

        if (options.limit)  args.take = options.limit;
        if (options.offset) args.skip = options.offset;

        const records = await this.prisma.paymentHistory.findMany(args);

        // Flatten the nested `subscription` relation into subscription_name/subscription_plan —
        // matches the flat shape the frontend expects (ported from the old raw-SQL JOIN aliases).
        return records.map(({ subscription, ...record }) => ({
            ...record,
            subscription_name: subscription?.name,
            subscription_plan: subscription?.plan,
        }));
    }

    /**
     * Get a single payment record with subscription details.
     */
    async getPaymentById(id) {
        const record = await this.prisma.paymentHistory.findUnique({
            where:   { id },
            include: { subscription: { include: { category: true } } },
        });
        if (!record) return null;

        const { subscription, ...rest } = record;
        return {
            ...rest,
            subscription_name: subscription?.name,
            subscription_plan: subscription?.plan,
            subscription_category: subscription?.category?.label,
        };
    }

    /**
     * Monthly stats grouped by currency.
     */
    async getMonthlyStats(year, month) {
        const monthStr  = month.toString().padStart(2, '0');
        const startDate = new Date(`${year}-${monthStr}-01`);
        const endDate   = new Date(year, month, 0);

        return await this.prisma.$queryRaw`
            SELECT
                COUNT(*)::int                                                       AS total_payments,
                SUM(CASE WHEN status = 'succeeded' THEN amount_paid ELSE 0 END)::float AS total_amount,
                COUNT(CASE WHEN status = 'succeeded' THEN 1 END)::int               AS successful_payments,
                COUNT(CASE WHEN status = 'failed'   THEN 1 END)::int               AS failed_payments,
                currency,
                AVG(CASE WHEN status = 'succeeded' THEN amount_paid END)::float    AS avg_payment_amount
            FROM payment_history
            WHERE payment_date >= ${startDate}::date AND payment_date <= ${endDate}::date
            GROUP BY currency
            ORDER BY total_amount DESC
        `;
    }

    /**
     * Yearly stats grouped by month and currency.
     */
    async getYearlyStats(year) {
        const startDate = new Date(`${year}-01-01`);
        const endDate   = new Date(`${year}-12-31`);

        return await this.prisma.$queryRaw`
            SELECT
                EXTRACT(MONTH FROM payment_date)::int                               AS month,
                COUNT(*)::int                                                       AS total_payments,
                SUM(CASE WHEN status = 'succeeded' THEN amount_paid ELSE 0 END)::float AS total_amount,
                COUNT(CASE WHEN status = 'succeeded' THEN 1 END)::int               AS successful_payments,
                currency
            FROM payment_history
            WHERE payment_date >= ${startDate}::date AND payment_date <= ${endDate}::date
            GROUP BY EXTRACT(MONTH FROM payment_date), currency
            ORDER BY month, currency
        `;
    }

    /**
     * Quarterly stats grouped by month and currency.
     */
    async getQuarterlyStats(year, quarter) {
        const quarterMonths = {
            1: { start: '01', end: '03' },
            2: { start: '04', end: '06' },
            3: { start: '07', end: '09' },
            4: { start: '10', end: '12' },
        };
        const { start, end } = quarterMonths[quarter];
        const startDate = new Date(`${year}-${start}-01`);
        const endDate   = new Date(`${year}-${end}-31`);

        return await this.prisma.$queryRaw`
            SELECT
                EXTRACT(MONTH FROM payment_date)::int                               AS month,
                COUNT(*)::int                                                       AS total_payments,
                SUM(CASE WHEN status = 'succeeded' THEN amount_paid ELSE 0 END)::float AS total_amount,
                COUNT(CASE WHEN status = 'succeeded' THEN 1 END)::int               AS successful_payments,
                currency
            FROM payment_history
            WHERE payment_date >= ${startDate}::date AND payment_date <= ${endDate}::date
            GROUP BY EXTRACT(MONTH FROM payment_date), currency
            ORDER BY month, currency
        `;
    }

    /**
     * Insert a payment record only (no summary side-effect) — used by both
     * createPayment() and bulkCreatePayments() so bulk inserts can run inside
     * a single Prisma transaction via the `client` (tx) handle.
     * @param {Object} paymentData
     * @param {Object} [client] - Prisma client or transaction handle (defaults to this.prisma)
     */
    async _insertPaymentRecord(paymentData, client = this.prisma) {
        const {
            subscription_id,
            payment_date,
            amount_paid,
            currency,
            billing_period_start,
            billing_period_end,
            status = 'succeeded',
            notes,
        } = paymentData;

        // Verify subscription exists
        const sub = await client.subscription.findUnique({ where: { id: subscription_id } });
        if (!sub) throw new NotFoundError('Subscription');

        return client.paymentHistory.create({
            data: {
                subscription_id,
                payment_date:         new Date(payment_date),
                amount_paid,
                currency,
                billing_period_start: new Date(billing_period_start),
                billing_period_end:   new Date(billing_period_end),
                status,
                notes,
            },
        });
    }

    /**
     * Create a new payment record and update monthly category summary.
     */
    async createPayment(paymentData) {
        const record = await this._insertPaymentRecord(paymentData);

        if (record.status === 'succeeded') {
            try {
                await this.monthlyCategorySummaryService.processNewPayment(record.id);
                logger.info(`Monthly category summary updated for new payment ${record.id}`);
            } catch (error) {
                logger.error(`Failed to update monthly category summary for payment ${record.id}:`, error.message);
            }
        }

        return record;
    }

    /**
     * Update a payment record and refresh affected monthly summaries.
     */
    async updatePayment(id, updateData) {
        const existingPayment = await this.findById(id);
        if (!existingPayment) throw new NotFoundError('Payment record');

        // Convert date strings to Date objects where needed
        const data = { ...updateData };
        if (data.payment_date)         data.payment_date         = new Date(data.payment_date);
        if (data.billing_period_start) data.billing_period_start = new Date(data.billing_period_start);
        if (data.billing_period_end)   data.billing_period_end   = new Date(data.billing_period_end);

        const result = await this.update(id, data);

        const fieldsAffectingSummary = [
            'payment_date', 'amount_paid', 'currency', 'status',
            'billing_period_start', 'billing_period_end',
        ];
        const hasSignificantChanges = fieldsAffectingSummary.some(
            (f) => updateData[f] !== undefined && String(updateData[f]) !== String(existingPayment[f])
        );

        if (hasSignificantChanges) {
            try {
                const monthsToUpdate = new Set();

                if (updateData.payment_date && updateData.payment_date !== existingPayment.payment_date) {
                    const old = new Date(existingPayment.payment_date);
                    monthsToUpdate.add(`${old.getFullYear()}-${old.getMonth() + 1}`);
                    const neu = new Date(updateData.payment_date);
                    monthsToUpdate.add(`${neu.getFullYear()}-${neu.getMonth() + 1}`);
                } else {
                    const d = new Date(existingPayment.payment_date);
                    monthsToUpdate.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
                }

                for (const key of monthsToUpdate) {
                    const [year, month] = key.split('-').map(Number);
                    await this.monthlyCategorySummaryService.updateMonthlyCategorySummary(year, month);
                }

                logger.info(`Monthly category summary updated for payment ${id} changes. Months: ${Array.from(monthsToUpdate).join(', ')}`);
            } catch (error) {
                logger.error(`Failed to update monthly category summary for payment ${id}:`, error.message);
            }
        }

        return result;
    }

    /**
     * Delete a payment record and refresh the affected month's summary.
     */
    async deletePayment(id) {
        const existingPayment = await this.findById(id);
        if (!existingPayment) throw new NotFoundError('Payment record');

        const result = await this.delete(id);

        if (existingPayment.status === 'succeeded') {
            try {
                const d     = new Date(existingPayment.payment_date);
                const year  = d.getFullYear();
                const month = d.getMonth() + 1;
                await this.monthlyCategorySummaryService.processPaymentDeletion(year, month);
                logger.info(`Monthly category summary updated for deleted payment ${id}`);
            } catch (error) {
                logger.error(`Failed to update monthly category summary for deleted payment ${id}:`, error.message);
            }
        }

        return result;
    }

    /**
     * Bulk create payment records inside a single Prisma transaction (all-or-nothing).
     * Monthly category summaries are refreshed after the transaction commits, since the
     * summary service reads through the main client and wouldn't see uncommitted rows.
     */
    async bulkCreatePayments(paymentsData) {
        const records = await this.prisma.$transaction(async (tx) => {
            const results = [];
            for (const paymentData of paymentsData) {
                results.push(await this._insertPaymentRecord(paymentData, tx));
            }
            return results;
        });

        for (const record of records) {
            if (record.status === 'succeeded') {
                try {
                    await this.monthlyCategorySummaryService.processNewPayment(record.id);
                } catch (error) {
                    logger.error(`Failed to update monthly category summary for payment ${record.id}:`, error.message);
                }
            }
        }

        return records;
    }

    /**
     * Recalculate all monthly category summaries.
     */
    async recalculateMonthlyCategorySummaries() {
        try {
            await this.monthlyCategorySummaryService.recalculateAllMonthlyCategorySummaries();
            logger.info('Monthly category summaries recalculated successfully');
        } catch (error) {
            logger.error('Failed to recalculate monthly category summaries:', error.message);
            throw error;
        }
    }

    // Kept for API compatibility
    close() {}
}

module.exports = PaymentHistoryService;
