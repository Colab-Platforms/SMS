const cron = require('node-cron');
const NotificationService = require('./notificationService');
const prisma = require('../lib/prisma');
const { runWithOrg, getOrgId } = require('../lib/orgContext');

/**
 * Sends renewal/expiration notifications. Runs once a day, at a fixed time,
 * for every active company (per-company custom check time is no longer
 * used — a single daily run keeps the database from being woken up every
 * few minutes).
 */
class NotificationScheduler {
    constructor() {
        this.prisma              = prisma;
        this.notificationService = new NotificationService(this.prisma);
        this.job                 = null;
    }

    start() {
        this.job = cron.schedule('0 10 * * *', () => this.tick(), {
            scheduled: true,
            timezone: 'Asia/Kolkata',
        });
        console.log('✅ Notification scheduler started (runs daily at 10:00 AM IST)');
    }

    stop() {
        if (this.job) {
            this.job.stop();
            this.job = null;
            console.log('⏹️ Notification scheduler stopped');
        }
    }

    /**
     * One sweep across every active company, run once a day.
     */
    async tick() {
        try {
            const organizations = await this.prisma.raw.organization.findMany({ where: { is_active: true } });
            for (const org of organizations) {
                await this.processOrg(org.id);
            }
        } catch (error) {
            console.error('❌ Notification scheduler tick failed:', error);
        }
    }

    async processOrg(organizationId) {
        await runWithOrg(organizationId, async () => {
            const settings = await this.getSchedulerSettings();
            if (!settings.is_enabled) return;

            console.log(`🔔 Running notification check for organization ${organizationId}`);
            await this.checkAndSendNotifications();
        });
    }

    /**
     * Fetch this company's scheduler settings, with defaults if not yet set up.
     */
    async getSchedulerSettings() {
        try {
            const result = await this.prisma.schedulerSettings.findFirst({});
            if (!result) {
                return { notification_check_time: '09:00', timezone: 'Asia/Shanghai', is_enabled: true };
            }
            return result;
        } catch (error) {
            console.error('Error getting scheduler settings:', error);
            return { notification_check_time: '09:00', timezone: 'Asia/Shanghai', is_enabled: true };
        }
    }

    async checkAndSendNotifications() {
        try {
            console.log('🔍 Checking for notifications to send...');

            const renewalNotifications    = await this.getRenewalNotifications();
            console.log(`📅 Found ${renewalNotifications.length} renewal reminders`);
            for (const notification of renewalNotifications) {
                await this.sendNotification(notification);
            }

            const expirationNotifications = await this.getExpirationNotifications();
            console.log(`⚠️ Found ${expirationNotifications.length} expiration warnings`);
            for (const notification of expirationNotifications) {
                await this.sendNotification(notification);
            }

            console.log(`✅ Processed ${renewalNotifications.length + expirationNotifications.length} notifications`);
        } catch (error) {
            console.error('❌ Notification check failed:', error);
        }
    }

    /**
     * Get subscriptions due for renewal reminder within the advance_days window.
     */
    async getRenewalNotifications() {
        try {
            const organizationId = getOrgId();
            return await this.prisma.$queryRaw`
                SELECT s.*,
                       ns.advance_days,
                       ns.notification_channels,
                       ns.repeat_notification,
                       'renewal_reminder' AS notification_type
                FROM subscriptions s
                CROSS JOIN notification_settings ns
                WHERE ns.notification_type = 'renewal_reminder'
                    AND ns.is_enabled = true
                    AND s.organization_id = ${organizationId}
                    AND ns.organization_id = ${organizationId}
                    AND s.status = 'active'
                    AND s.next_billing_date BETWEEN
                        (CURRENT_DATE + INTERVAL '1 day') AND
                        (CURRENT_DATE + (ns.advance_days || ' days')::INTERVAL)
                    AND (
                        ns.repeat_notification = true
                        OR NOT EXISTS (
                            SELECT 1 FROM notification_history nh
                            WHERE nh.subscription_id = s.id
                              AND nh.organization_id = ${organizationId}
                              AND nh.notification_type = 'renewal_reminder'
                              AND nh.status = 'sent'
                              AND nh.created_at >= (CURRENT_TIMESTAMP - (ns.advance_days || ' days')::INTERVAL)
                        )
                    )
            `;
        } catch (error) {
            console.error('Error getting renewal notifications:', error);
            return [];
        }
    }

    /**
     * Get subscriptions that expired yesterday (send once on first day after expiry).
     */
    async getExpirationNotifications() {
        try {
            const organizationId = getOrgId();
            return await this.prisma.$queryRaw`
                SELECT s.*,
                       ns.notification_channels,
                       'expiration_warning' AS notification_type
                FROM subscriptions s
                CROSS JOIN notification_settings ns
                WHERE ns.notification_type = 'expiration_warning'
                    AND ns.is_enabled = true
                    AND s.organization_id = ${organizationId}
                    AND ns.organization_id = ${organizationId}
                    AND s.status = 'active'
                    AND s.next_billing_date = (CURRENT_DATE - INTERVAL '1 day')
                    AND NOT EXISTS (
                        SELECT 1 FROM notification_history nh
                        WHERE nh.subscription_id = s.id
                          AND nh.organization_id = ${organizationId}
                          AND nh.notification_type = 'expiration_warning'
                          AND nh.status = 'sent'
                          AND nh.created_at >= CURRENT_DATE::timestamp
                    )
            `;
        } catch (error) {
            console.error('Error getting expiration notifications:', error);
            return [];
        }
    }

    async sendNotification(subscription) {
        try {
            const result = await this.notificationService.sendNotification({
                subscriptionId:   subscription.id,
                notificationType: subscription.notification_type,
                channels:         JSON.parse(subscription.notification_channels || '["whatsapp"]'),
            });

            if (result.success) {
                console.log(`✅ Notification sent for subscription: ${subscription.name} (${subscription.notification_type})`);
            } else {
                console.error(`❌ Failed to send notification for subscription: ${subscription.name}`, result.error);
            }
        } catch (error) {
            console.error(`❌ Error sending notification for subscription: ${subscription.name}`, error);
        }
    }

    /**
     * Manually trigger a check for the current request's company only.
     */
    async triggerCheck() {
        console.log('🔔 Manually triggering notification check...');
        await this.checkAndSendNotifications();
    }

    /**
     * Update this company's scheduler settings.
     */
    async updateSchedulerSettings(settings) {
        try {
            const organizationId = getOrgId();
            await this.prisma.schedulerSettings.upsert({
                where:  { organization_id: organizationId },
                update: {
                    notification_check_time: settings.notification_check_time,
                    timezone:                settings.timezone,
                    is_enabled:              Boolean(settings.is_enabled),
                },
                create: {
                    organization_id:         organizationId,
                    notification_check_time: settings.notification_check_time,
                    timezone:                settings.timezone,
                    is_enabled:              Boolean(settings.is_enabled),
                },
            });

            return { success: true };
        } catch (error) {
            console.error('Error updating scheduler settings:', error);
            return { success: false, error: error.message };
        }
    }

    getStatus() {
        return {
            running: this.job !== null,
        };
    }

    // Kept for API compatibility — Prisma manages connection lifecycle
    close() {
        if (this.notificationService) this.notificationService.close();
    }
}

module.exports = NotificationScheduler;
