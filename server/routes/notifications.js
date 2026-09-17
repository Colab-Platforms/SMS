const express = require('express');
const NotificationController = require('../controllers/notificationController');
const auth = require('../middleware/auth');

function createNotificationRoutes(db) {
    const router = express.Router();
    const notificationController = new NotificationController(db);

    // Public routes
    router.get('/history', notificationController.getNotificationHistory);
    router.get('/stats', notificationController.getNotificationStats);
    
    return router;
}

function createProtectedNotificationRoutes(db) {
    const router = express.Router();
    const notificationController = new NotificationController(db);

    // 通知设置路由
    router.get('/settings', notificationController.getAllSettings);
    router.get('/settings/:type', notificationController.getSettings);
    router.put('/settings/:id', notificationController.updateSetting);

    // 渠道配置路由
    router.post('/channels', notificationController.configureChannel);
    router.get('/channels/:channelType', notificationController.getChannelConfig);

    // 渠道凭证路由 (provider API keys — separate from recipient config above)
    router.put('/channels/:channelType/credentials', notificationController.saveChannelCredentials);
    router.get('/channels/:channelType/credentials/status', notificationController.getChannelCredentialsStatus);

    // 通知操作路由
    router.post('/send', notificationController.sendNotification);
    router.post('/test', notificationController.testNotification);

    // 历史记录路由
    router.get('/history', notificationController.getNotificationHistory);

    // 统计路由
    router.get('/stats', notificationController.getNotificationStats);

    // WhatsApp相关路由
    router.post('/validate-phone-number', notificationController.validatePhoneNumber);
    router.get('/whatsapp/session-status', notificationController.getWhatsappSessionStatus);
    router.get('/whatsapp/config-status', notificationController.getWhatsappConfigStatus);

    return router;
}

module.exports = { createNotificationRoutes, createProtectedNotificationRoutes };