const NotificationService = require('../services/notificationService');
const TelegramService = require('../services/telegramService');
const responseHelper = require('../utils/responseHelper');
const {
    validateNotificationSetting,
    validateChannelConfig,
    validateSendNotification,
    createValidator
} = require('../utils/validator');

class NotificationController {
    constructor(prisma) {
        this.notificationService = new NotificationService(prisma);
        this.telegramService     = new TelegramService();
    }

    /**
     * Get single notification setting
     */
    getSettings = async (req, res) => {
        try {
            const settings = await this.notificationService.getNotificationSettings(req.params.type);
            if (!settings) return responseHelper.notFound(res, 'Notification settings not found');
            responseHelper.success(res, settings);
        } catch (error) {
            console.error('Error getting notification settings:', error);
            responseHelper.error(res, 'Failed to get notification settings', 500);
        }
    };

    /**
     * Get all notification settings
     */
    getAllSettings = async (req, res) => {
        try {
            const settings = await this.notificationService.prisma.notificationSetting.findMany({
                orderBy: { notification_type: 'asc' },
            });

            const parsedSettings = settings.map((s) => ({
                ...s,
                notification_channels: JSON.parse(s.notification_channels || '["telegram"]'),
            }));

            responseHelper.success(res, parsedSettings);
        } catch (error) {
            console.error('Error getting all notification settings:', error);
            responseHelper.error(res, 'Failed to get notification settings', 500);
        }
    };

    /**
     * Update a notification setting
     */
    updateSetting = async (req, res) => {
        try {
            const settingId  = parseInt(req.params.id);
            const updateData = req.body;

            const validator = createValidator();
            validator
                .boolean(updateData.is_enabled, 'is_enabled')
                .integer(updateData.advance_days, 'advance_days')
                .range(updateData.advance_days, 'advance_days', 0, 365)
                .array(updateData.notification_channels, 'notification_channels')
                .custom(
                    updateData.notification_channels, 'notification_channels',
                    (ch) => !ch || ch.every((c) => ['telegram', 'email', 'webhook'].includes(c)),
                    'notification_channels must contain only valid channel types: telegram, email, webhook'
                )
                .boolean(updateData.repeat_notification, 'repeat_notification');

            if (validator.hasErrors()) return responseHelper.badRequest(res, validator.getErrors());

            const { is_enabled, advance_days, notification_channels, repeat_notification } = updateData;

            // Normalize boolean-ish values (supports true/false, 1/0, and their string forms)
            const normalizeBoolean = (value) => {
                if (typeof value === 'boolean') return value;
                if (value === 1 || value === '1' || value === 'true') return true;
                if (value === 0 || value === '0' || value === 'false') return false;
                return Boolean(value);
            };
            const normalizedIsEnabled          = normalizeBoolean(is_enabled);
            const normalizedRepeatNotification = normalizeBoolean(repeat_notification);

            // Find current setting by id
            const currentSetting = await this.notificationService.prisma.notificationSetting.findUnique({
                where: { id: settingId },
            });
            if (!currentSetting) return responseHelper.notFound(res, 'Notification setting not found');

            // expiration_warning always has advance_days = 0
            const finalAdvanceDays = currentSetting.notification_type === 'expiration_warning' ? 0 : advance_days;

            await this.notificationService.prisma.notificationSetting.update({
                where: { id: settingId },
                data: {
                    is_enabled:            normalizedIsEnabled,
                    advance_days:          finalAdvanceDays,
                    notification_channels: JSON.stringify(notification_channels || ['telegram']),
                    repeat_notification:   normalizedRepeatNotification,
                },
            });

            responseHelper.success(res, { message: 'Notification setting updated successfully' });
        } catch (error) {
            console.error('Error updating notification setting:', error);
            responseHelper.error(res, 'Failed to update notification setting', 500);
        }
    };

    /**
     * 配置通知渠道
     */
    configureChannel = async (req, res) => {
        try {
            const channelData = req.body;

            // 验证输入数据
            const validator = validateChannelConfig(channelData);
            if (validator.hasErrors()) {
                return responseHelper.badRequest(res, validator.getErrors());
            }

            const { channel_type, config } = channelData;
            const result = await this.notificationService.configureChannel(channel_type, config);

            if (result.success) {
                responseHelper.success(res, result);
            } else {
                responseHelper.error(res, result.error || 'Failed to configure channel', 400);
            }
        } catch (error) {
            console.error('Error configuring channel:', error);
            responseHelper.error(res, 'Failed to configure channel', 500);
        }
    };

    /**
     * 获取渠道配置
     */
    getChannelConfig = async (req, res) => {
        try {
            const channelType = req.params.channelType;

            const config = await this.notificationService.getChannelConfig(channelType);

            if (!config) {
                return responseHelper.notFound(res, 'Channel configuration');
            }

            responseHelper.success(res, config);
        } catch (error) {
            console.error('Error getting channel config:', error);
            responseHelper.error(res, 'Failed to get channel configuration', 500);
        }
    };

    /**
     * 测试通知
     */
    testNotification = async (req, res) => {
        try {
            const { channel_type } = req.body;

            // 验证输入数据
            const validator = createValidator();
            validator
                .required(channel_type, 'channel_type')
                .string(channel_type, 'channel_type')
                .enum(channel_type, 'channel_type', ['telegram', 'email', 'webhook']);

            if (validator.hasErrors()) {
                return responseHelper.badRequest(res, validator.getErrors());
            }

            const result = await this.notificationService.testNotification(channel_type);

            if (result.success) {
                responseHelper.success(res, result);
            } else {
                responseHelper.error(res, result.error || 'Failed to send test notification', 400);
            }
        } catch (error) {
            console.error('Error testing notification:', error);
            responseHelper.error(res, 'Failed to test notification', 500);
        }
    };

    /**
     * 发送通知
     */
    sendNotification = async (req, res) => {
        try {
            const notificationData = req.body;

            // 验证输入数据
            const validator = validateSendNotification(notificationData);
            if (validator.hasErrors()) {
                return responseHelper.badRequest(res, validator.getErrors());
            }

            const { subscription_id, notification_type, channels } = notificationData;

            const result = await this.notificationService.sendNotification({
                subscriptionId: subscription_id,
                notificationType: notification_type,
                channels
            });

            if (result.success) {
                responseHelper.success(res, result);
            } else {
                responseHelper.error(res, result.error || 'Failed to send notification', 400);
            }
        } catch (error) {
            console.error('Error sending notification:', error);
            responseHelper.error(res, 'Failed to send notification', 500);
        }
    };

    /**
     * Get notification history (paginated)
     */
    getNotificationHistory = async (req, res) => {
        try {
            const { page = 1, limit = 20, status, type } = req.query;

            const result = await this.notificationService.getNotificationHistory({
                page:  parseInt(page),
                limit: parseInt(limit),
                status,
                type,
            });

            responseHelper.success(res, {
                data: result.data,
                pagination: {
                    page:       result.page,
                    limit:      result.limit,
                    total:      result.total,
                    totalPages: result.totalPages,
                },
            });
        } catch (error) {
            console.error('Error getting notification history:', error);
            responseHelper.error(res, 'Failed to get notification history', 500);
        }
    };



    /**
     * Get notification statistics
     */
    getNotificationStats = async (req, res) => {
        try {
            const prisma = this.notificationService.prisma;

            const stats = { total: 0, sent: 0, failed: 0, byType: {}, byChannel: {} };

            // Overall counts grouped by status
            const totalStats = await prisma.notificationHistory.groupBy({
                by:     ['status'],
                _count: { status: true },
            });
            totalStats.forEach((s) => {
                stats.total += s._count.status;
                stats[s.status] = s._count.status;
            });

            // By type + status
            const typeStats = await prisma.notificationHistory.groupBy({
                by:     ['notification_type', 'status'],
                _count: { status: true },
            });
            typeStats.forEach((s) => {
                if (!stats.byType[s.notification_type]) stats.byType[s.notification_type] = { total: 0 };
                stats.byType[s.notification_type].total     += s._count.status;
                stats.byType[s.notification_type][s.status]  = s._count.status;
            });

            // By channel + status
            const channelStats = await prisma.notificationHistory.groupBy({
                by:     ['channel_type', 'status'],
                _count: { status: true },
            });
            channelStats.forEach((s) => {
                if (!stats.byChannel[s.channel_type]) stats.byChannel[s.channel_type] = { total: 0 };
                stats.byChannel[s.channel_type].total     += s._count.status;
                stats.byChannel[s.channel_type][s.status]  = s._count.status;
            });

            responseHelper.success(res, stats);
        } catch (error) {
            console.error('Error getting notification stats:', error);
            responseHelper.error(res, 'Failed to get notification statistics', 500);
        }
    };

    /**
     * 验证Telegram Chat ID
     */
    validateChatId = async (req, res) => {
        try {
            const { chat_id } = req.body;

            // 验证输入数据
            const validator = createValidator();
            validator
                .required(chat_id, 'chat_id')
                .string(chat_id, 'chat_id')
                .custom(chat_id, 'chat_id',
                    (chatId) => /^-?\d+$/.test(chatId),
                    'Chat ID must be a valid number string'
                );

            if (validator.hasErrors()) {
                return responseHelper.badRequest(res, validator.getErrors());
            }

            const result = await this.telegramService.validateChatId(chat_id);

            if (result.success) {
                responseHelper.success(res, result);
            } else {
                responseHelper.error(res, result.error || 'Invalid Chat ID', 400);
            }
        } catch (error) {
            console.error('Error validating Chat ID:', error);
            responseHelper.error(res, 'Failed to validate Chat ID', 500);
        }
    };

    /**
     * 获取Telegram Bot信息
     */
    getBotInfo = async (req, res) => {
        try {
            const result = await this.telegramService.getBotInfo();
            
            if (result.success) {
                responseHelper.success(res, result);
            } else {
                responseHelper.error(res, result.error || 'Failed to get bot info', 400);
            }
        } catch (error) {
            console.error('Error getting bot info:', error);
            responseHelper.error(res, 'Failed to get bot info', 500);
        }
    };

    /**
     * 获取Telegram配置状态
     */
    getTelegramConfigStatus = (req, res) => {
        try {
            const status = this.telegramService.getConfigStatus();
            responseHelper.success(res, status);
        } catch (error) {
            console.error('Error getting Telegram config status:', error);
            responseHelper.error(res, 'Failed to get Telegram config status', 500);
        }
    };

    /**
     * 清理资源
     */
    cleanup = () => {
        if (this.notificationService) {
            this.notificationService.close();
        }
    };
}

module.exports = NotificationController;