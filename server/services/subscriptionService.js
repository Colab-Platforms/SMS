const BaseRepository = require('../utils/BaseRepository');
const { calculateLastBillingDate, calculateNextBillingDate, calculateNextBillingDateFromStart, getTodayString } = require('../utils/dateUtils');
const MonthlyCategorySummaryService = require('./monthlyCategorySummaryService');
const NotificationService = require('./notificationService');
const logger = require('../utils/logger');
const { NotFoundError } = require('../middleware/errorHandler');

class SubscriptionService extends BaseRepository {
    constructor(prisma) {
        super(prisma, 'subscriptions');
        this.monthlyCategorySummaryService = new MonthlyCategorySummaryService(prisma);
        this.notificationService           = new NotificationService(prisma);
    }

    /**
     * Get all subscriptions with nested category and payment method.
     */
    async getAllSubscriptions() {
        const rows = await this.prisma.subscription.findMany({
            include: { category: true, paymentMethod: true },
            orderBy: { name: 'asc' },
        });
        return rows.map(this._formatSubscription);
    }

    /**
     * Get a single subscription by id.
     */
    async getSubscriptionById(id) {
        const row = await this.prisma.subscription.findUnique({
            where:   { id },
            include: { category: true, paymentMethod: true },
        });
        if (!row) return null;
        return this._formatSubscription(row);
    }

    /**
     * Create a new subscription and generate payment history.
     */
    async createSubscription(subscriptionData) {
        const {
            name, plan, billing_cycle, next_billing_date, amount, currency,
            payment_method_id, start_date, status = 'active', category_id,
            renewal_type = 'manual', notes, website,
        } = subscriptionData;

        const last_billing_date = calculateLastBillingDate(next_billing_date, start_date, billing_cycle);

        const record = await this.prisma.subscription.create({
            data: {
                name, plan, billing_cycle, amount, currency,
                payment_method_id: parseInt(payment_method_id),
                status, category_id: parseInt(category_id),
                renewal_type, notes, website,
                next_billing_date: next_billing_date ? new Date(next_billing_date) : null,
                last_billing_date: last_billing_date ? new Date(last_billing_date) : null,
                start_date:        start_date        ? new Date(start_date)        : null,
            },
        });

        // Auto-generate historical payment records
        try {
            await this.generatePaymentHistory(record.id);
            logger.info(`Payment history generated for subscription ${record.id}`);
        } catch (error) {
            logger.error(`Failed to generate payment history for subscription ${record.id}:`, error.message);
        }

        return record;
    }

    /**
     * Bulk create subscriptions.
     */
    async bulkCreateSubscriptions(subscriptionsData) {
        const records = [];

        for (const subscriptionData of subscriptionsData) {
            const record = await this.createSubscription(subscriptionData);
            records.push(record);
        }

        return records;
    }

    /**
     * Update a subscription and optionally regenerate payment history.
     */
    async updateSubscription(id, updateData) {
        const existingSubscription = await this.findById(id);
        if (!existingSubscription) throw new NotFoundError('Subscription');

        // Recalculate billing dates if relevant fields changed
        if (updateData.billing_cycle || updateData.next_billing_date || updateData.start_date) {
            const billing_cycle = updateData.billing_cycle || existingSubscription.billing_cycle;
            const start_date    = updateData.start_date    || existingSubscription.start_date;

            let next_billing_date;
            if (updateData.next_billing_date) {
                next_billing_date = updateData.next_billing_date;
            } else if (updateData.start_date || updateData.billing_cycle) {
                next_billing_date = calculateNextBillingDateFromStart(start_date, getTodayString(), billing_cycle);
                updateData.next_billing_date = next_billing_date;
            } else {
                next_billing_date = existingSubscription.next_billing_date;
            }

            updateData.last_billing_date = calculateLastBillingDate(next_billing_date, start_date, billing_cycle);
        }

        // Convert date strings to Date objects
        const data = { ...updateData };
        if (data.next_billing_date) data.next_billing_date = new Date(data.next_billing_date);
        if (data.last_billing_date) data.last_billing_date = new Date(data.last_billing_date);
        if (data.start_date)        data.start_date        = new Date(data.start_date);
        if (data.category_id)       data.category_id       = parseInt(data.category_id);
        if (data.payment_method_id) data.payment_method_id = parseInt(data.payment_method_id);

        const result = await this.update(id, data);

        // Regenerate payment history on key field changes
        const keyFields = ['amount', 'billing_cycle', 'start_date', 'status'];
        if (keyFields.some((f) => updateData.hasOwnProperty(f))) {
            try {
                await this.regeneratePaymentHistory(id);
                logger.info(`Payment history regenerated for subscription ${id}`);
            } catch (error) {
                logger.error(`Failed to regenerate payment history for subscription ${id}:`, error.message);
            }
        }

        // Async notification (fire-and-forget)
        this.notificationService
            .sendNotification({ subscriptionId: id, notificationType: 'subscription_change' })
            .then(() => logger.info(`Subscription change notification dispatched for subscription ${id}`))
            .catch((error) => logger.error(`Failed to send subscription change notification for subscription ${id}:`, error.message));

        return result;
    }

    /**
     * Delete a subscription and recalculate affected monthly summaries.
     */
    async deleteSubscription(id) {
        const existingSubscription = await this.findById(id);
        if (!existingSubscription) throw new NotFoundError('Subscription');

        // Get months with payment history before deleting
        const paymentMonths = await this.prisma.$queryRaw`
            SELECT DISTINCT
                EXTRACT(YEAR  FROM payment_date)::int AS year,
                EXTRACT(MONTH FROM payment_date)::int AS month
            FROM payment_history
            WHERE subscription_id = ${id} AND status = 'succeeded'
        `;

        // Delete (cascades payment_history via FK)
        const result = await this.delete(id);

        // Recalculate affected months
        if (paymentMonths.length > 0) {
            logger.info(`Recalculating monthly category summaries for ${paymentMonths.length} months after subscription deletion`);
            for (const { year, month } of paymentMonths) {
                try {
                    await this.monthlyCategorySummaryService.updateMonthlyCategorySummary(Number(year), Number(month));
                } catch (error) {
                    logger.error(`Failed to update monthly category summary for ${year}-${month}:`, error.message);
                }
            }
        }

        logger.info(`Subscription deleted: ${existingSubscription.name} (ID: ${id}), related data cleaned up automatically`);
        return result;
    }

    /**
     * Get subscription statistics.
     */
    async getSubscriptionStats() {
        const [totalStats, categoryStats, billingCycleStats] = await Promise.all([
            this.prisma.$queryRaw`
                SELECT
                    COUNT(*)::int                                                           AS total,
                    COUNT(CASE WHEN status = 'active'    THEN 1 END)::int                  AS active,
                    COUNT(CASE WHEN status = 'trial'     THEN 1 END)::int                  AS trial,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END)::int                  AS cancelled,
                    SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END)::float         AS total_active_amount,
                    AVG(CASE WHEN status = 'active' THEN amount END)::float                AS avg_active_amount
                FROM subscriptions
            `,
            this.prisma.$queryRaw`
                SELECT
                    category_id,
                    COUNT(*)::int                                              AS count,
                    SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END)::float AS total_amount
                FROM subscriptions
                GROUP BY category_id
                ORDER BY count DESC
            `,
            this.prisma.$queryRaw`
                SELECT
                    billing_cycle,
                    COUNT(*)::int                                              AS count,
                    SUM(CASE WHEN status = 'active' THEN amount ELSE 0 END)::float AS total_amount
                FROM subscriptions
                GROUP BY billing_cycle
                ORDER BY count DESC
            `,
        ]);

        return {
            total:          totalStats[0],
            byCategory:     categoryStats,
            byBillingCycle: billingCycleStats,
        };
    }

    /**
     * Get subscriptions due for renewal in the next N days.
     */
    async getUpcomingRenewals(days = 7) {
        const today      = new Date(getTodayString());
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + days);

        return await this.prisma.subscription.findMany({
            where: {
                status:            'active',
                next_billing_date: { gte: today, lte: futureDate },
            },
            orderBy: { next_billing_date: 'asc' },
        });
    }

    /**
     * Get overdue/expired subscriptions.
     */
    async getExpiredSubscriptions() {
        const today = new Date(getTodayString());
        return await this.prisma.subscription.findMany({
            where: {
                status:            'active',
                next_billing_date: { lt: today },
            },
            orderBy: { next_billing_date: 'asc' },
        });
    }

    async getSubscriptionsByCategory(category) {
        return await this.findAll({ filters: { category_id: category }, orderBy: { name: 'asc' } });
    }

    async getSubscriptionsByStatus(status) {
        return await this.findAll({ filters: { status }, orderBy: { name: 'asc' } });
    }

    async searchSubscriptions(query) {
        return await this.prisma.subscription.findMany({
            where: {
                OR: [
                    { name:  { contains: query, mode: 'insensitive' } },
                    { plan:  { contains: query, mode: 'insensitive' } },
                    { notes: { contains: query, mode: 'insensitive' } },
                ],
            },
            orderBy: { name: 'asc' },
        });
    }

    async getSubscriptionPaymentHistory(subscriptionId) {
        return await this.prisma.paymentHistory.findMany({
            where:   { subscription_id: subscriptionId },
            orderBy: { payment_date: 'desc' },
        });
    }

    /**
     * Reset all subscriptions and monthly summaries.
     */
    async resetAllSubscriptions() {
        const [subscriptionResult, monthlyCategorySummaryResult] = await this.prisma.$transaction([
            this.prisma.subscription.deleteMany({}),
            this.prisma.monthlyCategorySummary.deleteMany({}),
        ]);

        logger.info(`Reset completed: ${subscriptionResult.count} subscriptions, ${monthlyCategorySummaryResult.count} monthly category summaries deleted`);

        return {
            subscriptions:             subscriptionResult.count,
            monthlyCategorySummary:    monthlyCategorySummaryResult.count,
            message:                   'All subscription data has been reset successfully',
        };
    }

    /**
     * Generate payment history for a subscription from its start date to now.
     */
    async generatePaymentHistory(subscriptionId) {
        logger.info(`Generating payment history for subscription ${subscriptionId}`);

        try {
            const subscription = await this.findById(subscriptionId);
            if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);

            const payments = this._generateHistoricalPayments(subscription);
            if (payments.length === 0) return;

            // Bulk insert
            await this.prisma.paymentHistory.createMany({
                data: payments.map((p) => ({
                    subscription_id:      subscriptionId,
                    payment_date:         new Date(p.payment_date),
                    amount_paid:          subscription.amount,
                    currency:             subscription.currency,
                    billing_period_start: new Date(p.billing_period_start),
                    billing_period_end:   new Date(p.billing_period_end),
                    status:               'succeeded',
                    notes:                'Auto-generated from subscription data',
                })),
            });

            logger.info(`Generated ${payments.length} payment history records for subscription ${subscriptionId}`);

            // Refresh monthly summaries for all months covered
            const monthsSet = new Set();
            for (const p of payments) {
                const d = new Date(p.payment_date);
                monthsSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
            }
            for (const key of monthsSet) {
                const [year, month] = key.split('-').map(Number);
                try {
                    await this.monthlyCategorySummaryService.updateMonthlyCategorySummary(year, month);
                } catch (error) {
                    logger.error(`Failed to update monthly summary for ${key}:`, error.message);
                }
            }
        } catch (error) {
            logger.error(`Failed to generate payment history for subscription ${subscriptionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Delete existing payment history and regenerate it.
     */
    async regeneratePaymentHistory(subscriptionId) {
        logger.info(`Regenerating payment history for subscription ${subscriptionId}`);
        try {
            const subscription = await this.findById(subscriptionId);
            if (!subscription) throw new Error(`Subscription ${subscriptionId} not found`);

            const deleted = await this.prisma.paymentHistory.deleteMany({ where: { subscription_id: subscriptionId } });
            logger.info(`Deleted ${deleted.count} existing payment records for subscription ${subscriptionId}`);

            await this.generatePaymentHistory(subscriptionId);
        } catch (error) {
            logger.error(`Failed to regenerate payment history for subscription ${subscriptionId}:`, error.message);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    _generateHistoricalPayments(subscription) {
        const payments  = [];
        if (!subscription.start_date) return payments;

        const startDate = new Date(subscription.start_date);
        const today     = new Date();
        today.setHours(0, 0, 0, 0);

        const endDate = subscription.last_billing_date
            ? new Date(subscription.last_billing_date)
            : today;

        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const billingPeriodEnd = this._calculateNextBillingDate(currentDate, subscription.billing_cycle);
            payments.push({
                payment_date:         currentDate.toISOString().split('T')[0],
                billing_period_start: currentDate.toISOString().split('T')[0],
                billing_period_end:   billingPeriodEnd.toISOString().split('T')[0],
            });
            currentDate = new Date(billingPeriodEnd);
        }

        return payments;
    }

    _calculateNextBillingDate(currentDate, billingCycle) {
        const nextDate = new Date(currentDate);
        switch (billingCycle) {
            case 'monthly':    nextDate.setMonth(nextDate.getMonth() + 1);         break;
            case 'quarterly':  nextDate.setMonth(nextDate.getMonth() + 3);         break;
            case 'semiannual': nextDate.setMonth(nextDate.getMonth() + 6);         break;
            case 'yearly':     nextDate.setFullYear(nextDate.getFullYear() + 1);   break;
            default: throw new Error(`Unsupported billing cycle: ${billingCycle}`);
        }
        return nextDate;
    }

    _formatSubscription(row) {
        return {
            id:                row.id,
            name:              row.name,
            plan:              row.plan,
            billing_cycle:     row.billing_cycle,
            next_billing_date: row.next_billing_date,
            last_billing_date: row.last_billing_date,
            amount:            row.amount,
            currency:          row.currency,
            payment_method_id: row.payment_method_id,
            start_date:        row.start_date,
            status:            row.status,
            category_id:       row.category_id,
            renewal_type:      row.renewal_type,
            notes:             row.notes,
            website:           row.website,
            created_at:        row.created_at,
            updated_at:        row.updated_at,
            category:          row.category     || null,
            paymentMethod:     row.paymentMethod || null,
        };
    }

    close() {
        if (this.monthlyCategorySummaryService) this.monthlyCategorySummaryService.close();
        if (this.notificationService)           this.notificationService.close();
    }
}

module.exports = SubscriptionService;
