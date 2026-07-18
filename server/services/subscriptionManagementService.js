const BaseRepository = require('../utils/BaseRepository');
const { calculateNextBillingDate, getTodayString, isDateDueOrOverdue } = require('../utils/dateUtils');
const logger = require('../utils/logger');
const NotificationService = require('./notificationService');

/**
 * Subscription Management Service — handles renewals, expirations, and reactivations.
 * Fully async Prisma rewrite.
 */
class SubscriptionManagementService extends BaseRepository {
    constructor(prisma) {
        super(prisma, 'subscriptions');
        this.notificationService = new NotificationService(prisma);
    }

    /**
     * Process auto-renewals for all active auto-renew subscriptions.
     */
    async processAutoRenewals() {
        try {
            const activeAutoRenewalSubscriptions = await this.findAll({
                filters: { status: 'active', renewal_type: 'auto' },
            });

            let processed = 0;
            let errors    = 0;
            const renewedSubscriptions = [];

            for (const subscription of activeAutoRenewalSubscriptions) {
                try {
                    if (isDateDueOrOverdue(subscription.next_billing_date)) {
                        const renewalResult = await this._renewSubscription(subscription, 'auto');
                        if (renewalResult.success) {
                            processed++;
                            renewedSubscriptions.push(renewalResult.data);
                        } else {
                            errors++;
                            this.notificationService
                                .sendNotification({ subscriptionId: subscription.id, notificationType: 'renewal_failure' })
                                .then(() => logger.info(`Renewal failure notification dispatched for subscription ${subscription.id}`))
                                .catch((e) => logger.error(`Failed to send renewal failure notification for subscription ${subscription.id}:`, e.message));
                        }
                    }
                } catch (error) {
                    logger.error(`Error processing renewal for subscription ${subscription.id}:`, error.message);
                    errors++;
                }
            }

            const result = {
                message:             `Auto renewal complete: ${processed} processed, ${errors} errors`,
                processed,
                errors,
                renewedSubscriptions,
            };
            logger.info(result.message);
            return result;
        } catch (error) {
            logger.error('Failed to process auto renewals:', error.message);
            throw error;
        }
    }

    /**
     * Process expired manual subscriptions and mark them cancelled.
     */
    async processExpiredSubscriptions() {
        try {
            const activeManualSubscriptions = await this.findAll({
                filters: { status: 'active', renewal_type: 'manual' },
            });

            let processed = 0;
            let errors    = 0;
            const expiredSubscriptions = [];

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            for (const subscription of activeManualSubscriptions) {
                try {
                    if (!subscription.next_billing_date) continue;
                    const billingDate = new Date(subscription.next_billing_date);
                    billingDate.setHours(0, 0, 0, 0);

                    if (billingDate < today) {
                        await this.update(subscription.id, { status: 'cancelled' });
                        processed++;
                        expiredSubscriptions.push({
                            id:          subscription.id,
                            name:        subscription.name,
                            expiredDate: subscription.next_billing_date,
                        });
                    }
                } catch (error) {
                    logger.error(`Error processing expiration for subscription ${subscription.id}:`, error.message);
                    errors++;
                }
            }

            const result = {
                message:             `Expired subscriptions processed: ${processed} expired, ${errors} errors`,
                processed,
                errors,
                expiredSubscriptions,
            };
            logger.info(result.message);
            return result;
        } catch (error) {
            logger.error('Failed to process expired subscriptions:', error.message);
            throw error;
        }
    }

    /**
     * Manually renew a subscription.
     */
    async manualRenewSubscription(subscriptionId) {
        try {
            const subscription = await this.findById(subscriptionId);
            if (!subscription) throw new Error('Subscription not found');
            if (subscription.renewal_type !== 'manual') {
                throw new Error('Only manual renewal subscriptions can be manually renewed');
            }

            const renewalResult = await this._renewSubscription(subscription, 'manual');

            if (renewalResult.success) {
                logger.info(`Manual renewal completed for subscription ${subscriptionId}`);
                return { message: 'Subscription renewed successfully', renewalData: renewalResult.data };
            } else {
                this.notificationService
                    .sendNotification({ subscriptionId: subscription.id, notificationType: 'renewal_failure' })
                    .then(() => logger.info(`Manual renewal failure notification dispatched for subscription ${subscriptionId}`))
                    .catch((e) => logger.error(`Failed to send manual renewal failure notification for subscription ${subscriptionId}:`, e.message));
                throw new Error('Failed to update subscription');
            }
        } catch (error) {
            logger.error(`Failed to manually renew subscription ${subscriptionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Reactivate a cancelled subscription.
     */
    async reactivateSubscription(subscriptionId) {
        try {
            const subscription = await this.findById(subscriptionId);
            if (!subscription) throw new Error('Subscription not found');
            if (subscription.status !== 'cancelled') {
                throw new Error('Only cancelled subscriptions can be reactivated');
            }

            const todayStr         = getTodayString();
            const newNextBillingStr = calculateNextBillingDate(todayStr, subscription.billing_cycle);

            await this.prisma.$transaction(async (tx) => {
                await tx.subscription.update({
                    where: { id: subscriptionId },
                    data:  {
                        last_billing_date: new Date(todayStr),
                        next_billing_date: new Date(newNextBillingStr),
                        status:            'active',
                    },
                });

                await tx.paymentHistory.create({
                    data: {
                        subscription_id:      subscriptionId,
                        payment_date:         new Date(todayStr),
                        amount_paid:          subscription.amount,
                        currency:             subscription.currency,
                        billing_period_start: new Date(todayStr),
                        billing_period_end:   new Date(newNextBillingStr),
                        status:               'succeeded',
                        notes:                'Subscription reactivation payment',
                    },
                });
            });

            logger.info(`Subscription ${subscriptionId} reactivated successfully`);
            return {
                message:          'Subscription reactivated successfully',
                reactivationData: {
                    id:             subscription.id,
                    name:           subscription.name,
                    newLastBilling: todayStr,
                    newNextBilling: newNextBillingStr,
                    status:         'active',
                },
            };
        } catch (error) {
            logger.error(`Failed to reactivate subscription ${subscriptionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Reset all subscriptions and related data.
     */
    async resetAllSubscriptions() {
        try {
            const [paymentHistoryResult, subscriptionResult] = await this.prisma.$transaction([
                this.prisma.paymentHistory.deleteMany({}),
                this.prisma.subscription.deleteMany({}),
            ]);

            const result = {
                message:      'All subscriptions and related data have been deleted.',
                deletedCounts: {
                    subscriptions:  subscriptionResult.count,
                    paymentHistory: paymentHistoryResult.count,
                },
            };

            logger.info(`Reset completed: ${subscriptionResult.count} subscriptions, ${paymentHistoryResult.count} payment records deleted`);
            return result;
        } catch (error) {
            logger.error('Failed to reset subscriptions:', error.message);
            throw error;
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    async _renewSubscription(subscription, renewalType) {
        const todayStr = getTodayString();

        let baseDate;
        if (renewalType === 'manual') {
            const today              = new Date();
            today.setHours(0, 0, 0, 0);
            const currentNextBilling = new Date(subscription.next_billing_date);
            currentNextBilling.setHours(0, 0, 0, 0);
            baseDate = currentNextBilling >= today ? subscription.next_billing_date : todayStr;
        } else {
            baseDate = subscription.next_billing_date;
        }

        const newNextBillingStr = calculateNextBillingDate(
            baseDate instanceof Date ? baseDate.toISOString().split('T')[0] : String(baseDate),
            subscription.billing_cycle
        );

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.subscription.update({
                    where: { id: subscription.id },
                    data:  {
                        last_billing_date: new Date(todayStr),
                        next_billing_date: new Date(newNextBillingStr),
                        status:            'active',
                    },
                });

                await tx.paymentHistory.create({
                    data: {
                        subscription_id:      subscription.id,
                        payment_date:         new Date(todayStr),
                        amount_paid:          subscription.amount,
                        currency:             subscription.currency,
                        billing_period_start: new Date(new Date(subscription.next_billing_date).toISOString().split('T')[0]),
                        billing_period_end:   new Date(newNextBillingStr),
                        status:               'succeeded',
                        notes:                `${renewalType === 'auto' ? 'Auto' : 'Manual'} renewal payment`,
                    },
                });
            });

            const renewalData = {
                id:             subscription.id,
                name:           subscription.name,
                oldNextBilling: subscription.next_billing_date,
                newLastBilling: todayStr,
                newNextBilling: newNextBillingStr,
                renewedEarly:   renewalType === 'manual' && new Date(subscription.next_billing_date) >= new Date(),
            };

            this.notificationService
                .sendNotification({ subscriptionId: subscription.id, notificationType: 'renewal_success' })
                .then(() => logger.info(`Renewal success notification dispatched for subscription ${subscription.id}`))
                .catch((e) => logger.error(`Failed to send renewal success notification for subscription ${subscription.id}:`, e.message));

            return { success: true, data: renewalData };
        } catch (error) {
            logger.error(`Failed to renew subscription ${subscription.id}:`, error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = SubscriptionManagementService;
