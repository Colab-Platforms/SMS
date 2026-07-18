const cron = require('node-cron');
const NotificationService = require('./notificationService');
const prisma = require('../lib/prisma');

class NotificationScheduler {
    constructor() {
        this.prisma              = prisma;
        this.notificationService = new NotificationService(this.prisma);
        this.job                 = null;
        this.currentSchedule     = null;
    }

    /**
     * Start the notification scheduler.
     */
    start() {
        this.updateSchedule();
        console.log('✅ Notification scheduler started');
    }

    /**
     * Reload scheduler from DB settings.
     */
    async updateSchedule() {
        try {
            const settings = await this.getSchedulerSettings();

            if (
                this.currentSchedule &&
                this.currentSchedule.time     === settings.notification_check_time &&
                this.currentSchedule.timezone === settings.timezone &&
                this.currentSchedule.enabled  === settings.is_enabled
            ) {
                return;
            }

            if (this.job) {
                this.job.stop();
                this.job = null;
            }

            if (!settings.is_enabled) {
                console.log('⏸️ Notification scheduler is disabled');
                this.currentSchedule = null;
                return;
            }

            const [hour, minute]   = settings.notification_check_time.split(':');
            const cronExpression   = `${minute} ${hour} * * *`;

            this.job = cron.schedule(
                cronExpression,
                async () => {
                    console.log(`🔔 Starting notification check at ${settings.notification_check_time}...`);
                    await this.checkAndSendNotifications();
                },
                { scheduled: false, timezone: settings.timezone }
            );

            this.job.start();
            this.currentSchedule = {
                time:     settings.notification_check_time,
                timezone: settings.timezone,
                enabled:  settings.is_enabled,
            };

            console.log(`✅ Notification scheduler updated: ${settings.notification_check_time} (${settings.timezone})`);
        } catch (error) {
            console.error('Error updating notification schedule:', error);
        }
    }

    /**
     * Fetch scheduler settings from DB, with defaults.
     */
    async getSchedulerSettings() {
        try {
            const result = await this.prisma.schedulerSettings.findUnique({ where: { id: 1 } });
            if (!result) {
                return { notification_check_time: '09:00', timezone: 'Asia/Shanghai', is_enabled: true };
            }
            return result;
        } catch (error) {
            console.error('Error getting scheduler settings:', error);
            return { notification_check_time: '09:00', timezone: 'Asia/Shanghai', is_enabled: true };
        }
    }

    stop() {
        if (this.job) {
            this.job.stop();
            this.job = null;
            console.log('⏹️ Notification scheduler stopped');
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
     * Uses PostgreSQL date arithmetic instead of SQLite date('now', '+N days').
     */
    async getRenewalNotifications() {
        try {
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
                    AND s.status = 'active'
                    AND s.next_billing_date BETWEEN
                        (CURRENT_DATE + INTERVAL '1 day') AND
                        (CURRENT_DATE + (ns.advance_days || ' days')::INTERVAL)
                    AND (
                        ns.repeat_notification = true
                        OR NOT EXISTS (
                            SELECT 1 FROM notification_history nh
                            WHERE nh.subscription_id = s.id
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
     * Uses PostgreSQL CURRENT_DATE arithmetic instead of SQLite date('now', ...).
     */
    async getExpirationNotifications() {
        try {
            return await this.prisma.$queryRaw`
                SELECT s.*,
                       ns.notification_channels,
                       'expiration_warning' AS notification_type
                FROM subscriptions s
                CROSS JOIN notification_settings ns
                WHERE ns.notification_type = 'expiration_warning'
                    AND ns.is_enabled = true
                    AND s.status = 'active'
                    AND s.next_billing_date = (CURRENT_DATE - INTERVAL '1 day')
                    AND NOT EXISTS (
                        SELECT 1 FROM notification_history nh
                        WHERE nh.subscription_id = s.id
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
                channels:         JSON.parse(subscription.notification_channels || '["telegram"]'),
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

    async triggerCheck() {
        console.log('🔔 Manually triggering notification check...');
        await this.checkAndSendNotifications();
    }

    /**
     * Update scheduler settings in DB.
     */
    async updateSchedulerSettings(settings) {
        try {
            await this.prisma.schedulerSettings.upsert({
                where:  { id: 1 },
                update: {
                    notification_check_time: settings.notification_check_time,
                    timezone:                settings.timezone,
                    is_enabled:              Boolean(settings.is_enabled),
                },
                create: {
                    id:                      1,
                    notification_check_time: settings.notification_check_time,
                    timezone:                settings.timezone,
                    is_enabled:              Boolean(settings.is_enabled),
                },
            });

            await this.updateSchedule();
            return { success: true };
        } catch (error) {
            console.error('Error updating scheduler settings:', error);
            return { success: false, error: error.message };
        }
    }

    getStatus() {
        return {
            running: this.job !== null,
            nextRun: this.job ? this.job.running : false,
        };
    }

    // Kept for API compatibility — Prisma manages connection lifecycle
    close() {
        if (this.notificationService) this.notificationService.close();
    }
}

module.exports = NotificationScheduler;