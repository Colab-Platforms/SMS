const BaseRepository = require('../utils/BaseRepository');
const logger = require('../utils/logger');
const { getOrgId } = require('../lib/orgContext');

/**
 * Analytics Service — provides revenue and subscription statistics using Prisma + PostgreSQL.
 * SQLite strftime() replaced with PostgreSQL TO_CHAR() / EXTRACT() via $queryRaw.
 */
class AnalyticsService extends BaseRepository {
    constructor(prisma) {
        super(prisma, 'payment_history');
    }

    /**
     * Get monthly revenue grouped by month and currency.
     */
    async getMonthlyRevenue(filters = {}) {
        const { start_date, end_date, currency } = filters;

        try {
            // Build dynamic WHERE conditions for raw SQL
            const conditions = [`ph.status = 'succeeded'`];
            const values     = [];
            let   idx        = 1;

            conditions.push(`ph.organization_id = $${idx++}`);
            values.push(getOrgId());

            if (start_date) {
                conditions.push(`ph.payment_date >= $${idx++}::date`);
                values.push(start_date);
            }
            if (end_date) {
                conditions.push(`ph.payment_date <= $${idx++}::date`);
                values.push(end_date);
            }
            if (currency) {
                conditions.push(`ph.currency = $${idx++}`);
                values.push(currency);
            }

            const whereClause = conditions.join(' AND ');

            const results = await this.prisma.$queryRawUnsafe(`
                SELECT
                    TO_CHAR(ph.payment_date, 'YYYY-MM') AS month,
                    ph.currency,
                    SUM(ph.amount_paid)::float            AS total_revenue,
                    COUNT(ph.id)::int                     AS payment_count,
                    AVG(ph.amount_paid)::float            AS average_payment
                FROM payment_history ph
                WHERE ${whereClause}
                GROUP BY TO_CHAR(ph.payment_date, 'YYYY-MM'), ph.currency
                ORDER BY month DESC, ph.currency
            `, ...values);

            const monthlyStats = this._formatMonthlyStats(results);
            const summary      = this._calculateRevenueSummary(results);

            return {
                monthlyStats,
                summary,
                filters: {
                    startDate: start_date || null,
                    endDate:   end_date   || null,
                    currency:  currency   || null,
                },
            };
        } catch (error) {
            logger.error('Failed to get monthly revenue:', error.message);
            throw error;
        }
    }

    /**
     * Get active subscriptions for a given month (those with payment activity in that period).
     */
    async getMonthlyActiveSubscriptions(year, month) {
        this._validateMonthYear(month, year);

        const monthStr  = month.toString().padStart(2, '0');
        const targetMonth = `${year}-${monthStr}`;
        const firstDay  = `${targetMonth}-01`;
        const lastDay   = new Date(year, month, 0).toISOString().split('T')[0];
        const organizationId = getOrgId();

        try {
            const activeSubscriptions = await this.prisma.$queryRaw`
                SELECT DISTINCT
                    s.id,
                    s.name,
                    s.plan,
                    s.amount::float,
                    s.currency,
                    s.billing_cycle,
                    s.status,
                    s.category_id,
                    COUNT(ph.id)::int            AS payment_count_in_month,
                    SUM(ph.amount_paid)::float   AS total_paid_in_month,
                    MIN(ph.billing_period_start) AS earliest_period_start,
                    MAX(ph.billing_period_end)   AS latest_period_end
                FROM subscriptions s
                INNER JOIN payment_history ph ON s.id = ph.subscription_id
                WHERE ph.status = 'succeeded'
                    AND s.organization_id = ${organizationId}
                    AND (
                        (ph.billing_period_start <= ${new Date(lastDay)} AND ph.billing_period_end >= ${new Date(firstDay)}) OR
                        (ph.billing_period_start >= ${new Date(firstDay)} AND ph.billing_period_start <= ${new Date(lastDay)})
                    )
                GROUP BY s.id, s.name, s.plan, s.amount, s.currency, s.billing_cycle, s.status, s.category_id
                ORDER BY s.name
            `;

            const formattedSubscriptions = this._formatActiveSubscriptions(activeSubscriptions);
            const summary                = this._calculateActiveSubscriptionsSummary(activeSubscriptions);

            return {
                targetMonth,
                period:              { start: firstDay, end: lastDay },
                activeSubscriptions: formattedSubscriptions,
                summary,
            };
        } catch (error) {
            logger.error('Failed to get monthly active subscriptions:', error.message);
            throw error;
        }
    }

    _formatMonthlyStats(results) {
        return results.map((row) => ({
            month:          row.month,
            currency:       row.currency,
            totalRevenue:   parseFloat(row.total_revenue),
            paymentCount:   parseInt(row.payment_count),
            averagePayment: parseFloat(row.average_payment),
        }));
    }

    _calculateRevenueSummary(results) {
        return {
            totalMonths:   new Set(results.map((r) => r.month)).size,
            totalRevenue:  results.reduce((sum, r) => sum + parseFloat(r.total_revenue), 0),
            totalPayments: results.reduce((sum, r) => sum + parseInt(r.payment_count), 0),
            currencies:    [...new Set(results.map((r) => r.currency))],
        };
    }

    _formatActiveSubscriptions(subscriptions) {
        return subscriptions.map((sub) => ({
            id:                 sub.id,
            name:               sub.name,
            plan:               sub.plan,
            amount:             parseFloat(sub.amount),
            currency:           sub.currency,
            billingCycle:       sub.billing_cycle,
            status:             sub.status,
            categoryId:         sub.category_id,
            paymentCountInMonth: parseInt(sub.payment_count_in_month || 0),
            totalPaidInMonth:   parseFloat(sub.total_paid_in_month || 0),
            activePeriod: {
                start: sub.earliest_period_start,
                end:   sub.latest_period_end,
            },
        }));
    }

    _calculateActiveSubscriptionsSummary(subscriptions) {
        const summary = {
            totalActiveSubscriptions: subscriptions.length,
            totalRevenue:             0,
            totalPayments:            0,
            byCategory:               {},
            byCurrency:               {},
            byBillingCycle:           {},
        };

        subscriptions.forEach((sub) => {
            const revenue      = parseFloat(sub.total_paid_in_month || 0);
            const paymentCount = parseInt(sub.payment_count_in_month || 0);
            const category     = sub.category_id?.toString() || 'unknown';
            const currency     = sub.currency;
            const cycle        = sub.billing_cycle;

            summary.totalRevenue  += revenue;
            summary.totalPayments += paymentCount;

            if (!summary.byCategory[category]) summary.byCategory[category] = { count: 0, revenue: 0 };
            summary.byCategory[category].count++;
            summary.byCategory[category].revenue += revenue;

            if (!summary.byCurrency[currency]) summary.byCurrency[currency] = { count: 0, revenue: 0 };
            summary.byCurrency[currency].count++;
            summary.byCurrency[currency].revenue += revenue;

            if (!summary.byBillingCycle[cycle]) summary.byBillingCycle[cycle] = { count: 0, revenue: 0 };
            summary.byBillingCycle[cycle].count++;
            summary.byBillingCycle[cycle].revenue += revenue;
        });

        return summary;
    }

    _validateMonthYear(month, year) {
        const monthNum = parseInt(month);
        const yearNum  = parseInt(year);
        if (monthNum < 1 || monthNum > 12)      throw new Error('Month must be between 1 and 12');
        if (yearNum < 2000 || yearNum > 3000)   throw new Error('Year must be between 2000 and 3000');
    }
}

module.exports = AnalyticsService;
