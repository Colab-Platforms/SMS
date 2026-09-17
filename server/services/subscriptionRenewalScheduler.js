const cron = require('node-cron');
const logger = require('../utils/logger');
const SubscriptionManagementService = require('./subscriptionManagementService');
const { runWithOrg } = require('../lib/orgContext');

/**
 * 订阅续费定时任务服务
 * 负责处理自动续费和过期订阅的定时检查
 *
 * Runs once daily, looping over every active company and processing each
 * one's subscriptions inside that company's own org context.
 */
class SubscriptionRenewalScheduler {
    constructor(db) {
        this.db = db; // Organization isn't company-scoped, so this works with or without an active org context
        this.subscriptionManagementService = new SubscriptionManagementService(db);
        this.isRunning = false;
    }

    /**
     * 启动定时任务
     */
    start() {
        if (this.isRunning) {
            logger.warn('Scheduler service is already running');
            return;
        }

        // 每天凌晨2点执行自动续费和过期处理
        this.dailyTask = cron.schedule('0 2 * * *', async () => {
            logger.info('Starting daily subscription maintenance...');
            await this.runDailyMaintenance();
        }, {
            scheduled: false,
            timezone: "Asia/Shanghai" // 可以根据需要调整时区
        });

        // 启动任务
        this.dailyTask.start();
        this.isRunning = true;
        
        logger.info('Scheduler service started - Daily maintenance scheduled for 2:00 AM');
    }

    /**
     * 停止定时任务
     */
    stop() {
        if (this.dailyTask) {
            this.dailyTask.stop();
            this.dailyTask.destroy();
        }
        this.isRunning = false;
        logger.info('Scheduler service stopped');
    }

    /**
     * 执行日常维护任务 — loops over every active company.
     */
    async runDailyMaintenance() {
        try {
            logger.info('Running daily subscription maintenance...');

            const organizations = await this.db.organization.findMany({ where: { is_active: true } });

            let totalProcessed = 0;
            let totalErrors    = 0;
            const perOrgResults = [];

            for (const { id: organizationId } of organizations) {
                const result = await runWithOrg(organizationId, async () => {
                    const autoRenewalResult = await this.subscriptionManagementService.processAutoRenewals();
                    const expiredResult     = await this.subscriptionManagementService.processExpiredSubscriptions();
                    return { organizationId, autoRenewalResult, expiredResult };
                });

                totalProcessed += result.autoRenewalResult.processed + result.expiredResult.processed;
                totalErrors    += result.autoRenewalResult.errors    + result.expiredResult.errors;

                if (result.autoRenewalResult.processed > 0) {
                    logger.info(`[org ${organizationId}] Auto-renewed ${result.autoRenewalResult.processed} subscription(s)`);
                }
                if (result.expiredResult.processed > 0) {
                    logger.info(`[org ${organizationId}] Cancelled ${result.expiredResult.processed} expired subscription(s)`);
                }

                perOrgResults.push(result);
            }

            logger.info(`Daily maintenance completed for ${organizations.length} organization(s): ${totalProcessed} subscriptions processed, ${totalErrors} errors`);

            return {
                success: true,
                perOrgResults,
                totalProcessed,
                totalErrors
            };

        } catch (error) {
            logger.error('Error during daily maintenance:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 手动触发维护任务（用于测试或紧急情况）
     */
    async runMaintenanceNow() {
        logger.info('Manual maintenance triggered');
        return await this.runDailyMaintenance();
    }

    /**
     * 获取定时任务状态
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            nextRun: this.dailyTask ? this.dailyTask.nextDate() : null
        };
    }
}

module.exports = SubscriptionRenewalScheduler;
