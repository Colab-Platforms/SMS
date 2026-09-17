const WasenderService = require('./wasenderService');
const EmailService = require('./emailService');
const prisma = require('../lib/prisma');
const UserPreferenceService = require('./userPreferenceService');
const { getTemplate } = require('../config/notificationTemplates');
const { getOrgId } = require('../lib/orgContext');
const {
    SUPPORTED_NOTIFICATION_TYPES,
    SUPPORTED_CHANNELS,
    DEFAULT_NOTIFICATION_CHANNELS,
} = require('../config/notification');

class NotificationService {
    constructor(prismaClient = null) {
        this.prisma                = prismaClient || prisma;
        this.userPreferenceService = new UserPreferenceService(this.prisma);
    }

    /**
     * Send a notification for a subscription event.
     */
    async sendNotification(notificationData) {
        const { subscriptionId, notificationType, channels = null } = notificationData;

        try {
            if (!SUPPORTED_NOTIFICATION_TYPES.includes(notificationType)) {
                return { success: false, message: 'Invalid notification type' };
            }

            const settings = await this.getNotificationSettings(notificationType);
            if (!settings || !settings.is_enabled) {
                return { success: false, message: 'Notification type disabled' };
            }

            const subscription = await this.getSubscriptionById(subscriptionId);
            if (!subscription) {
                return { success: false, message: 'Subscription not found' };
            }

            const targetChannels = channels || (await this.getEnabledChannels());

            const results = await Promise.all(
                targetChannels.map((channel) =>
                    this.sendToChannel({ subscription, notificationType, channel, settings })
                )
            );

            return { success: true, results };
        } catch (error) {
            console.error('Notification service error:', error);
            return { success: false, error: error.message };
        }
    }

    async sendToChannel({ subscription, notificationType, channel, settings }) {
        try {
            const channelConfig = await this.getChannelConfig(channel);
            if (!channelConfig || !channelConfig.is_active) {
                return { success: false, channel, message: 'Channel not configured' };
            }

            const recipients = this.getRecipients(channelConfig, channel);
            if (recipients.length === 0) {
                return { success: false, channel, message: 'No recipients configured' };
            }

            const userLanguage = await this.userPreferenceService.getUserLanguage();
            const { content: messageContent, subject } = this.renderMessageTemplate({
                subscription,
                notificationType,
                channel,
                language: userLanguage,
            });

            const wasenderService = channel === 'whatsapp' ? await this.getWasenderServiceForOrg() : null;
            const emailService    = channel === 'email'    ? await this.getEmailServiceForOrg()    : null;

            const results = await Promise.all(recipients.map(async (recipient) => {
                const sendTime = new Date();
                let sendResult;
                switch (channel) {
                    case 'whatsapp':
                        sendResult = await wasenderService.sendMessage(recipient, messageContent);
                        break;
                    case 'email':
                        sendResult = await this.sendEmailNotification({
                            recipient, subscription, notificationType, subject, htmlContent: messageContent, emailService,
                        });
                        break;
                    default:
                        sendResult = { success: false, error: `Unsupported channel: ${channel}` };
                }

                await this.createNotificationRecord({
                    subscriptionId:  subscription.id,
                    notificationType,
                    channelType:     channel,
                    recipient,
                    messageContent,
                    status:          sendResult.success ? 'sent' : 'failed',
                    sentAt:          sendResult.success ? sendTime : null,
                    errorMessage:    sendResult.error || null,
                });

                return { recipient, ...sendResult };
            }));

            await this.updateChannelLastUsed(channel);

            return {
                success:      results.some((r) => r.success),
                allSucceeded: results.every((r) => r.success),
                channel,
                results,
            };
        } catch (error) {
            console.error(`Error sending to ${channel}:`, error);
            return { success: false, channel, error: error.message };
        }
    }

    async getNotificationSettings(notificationType) {
        try {
            return await this.prisma.notificationSetting.findFirst({
                where: { notification_type: notificationType },
            });
        } catch (error) {
            console.error('Error getting notification settings:', error);
            return null;
        }
    }

    async getSubscriptionById(subscriptionId) {
        try {
            return await this.prisma.subscription.findUnique({
                where:   { id: subscriptionId },
                include: { category: true, paymentMethod: true },
            });
        } catch (error) {
            console.error('Error getting subscription:', error);
            return null;
        }
    }

    async getEnabledChannels() {
        try {
            const results = await this.prisma.notificationChannel.findMany({
                where:  { is_active: true },
                select: { channel_type: true },
            });

            if (results.length === 0) return DEFAULT_NOTIFICATION_CHANNELS;
            return results.map((r) => r.channel_type);
        } catch (error) {
            console.error('Error getting enabled channels:', error);
            return DEFAULT_NOTIFICATION_CHANNELS;
        }
    }

    async getChannelConfig(channelType) {
        try {
            const result = await this.prisma.notificationChannel.findFirst({
                where: { channel_type: channelType },
                // credentials intentionally NOT selected — this response goes straight to the
                // browser, so provider API keys must never appear here (see setChannelCredentials
                // / getChannelCredentialsStatus for the credential-safe equivalents).
                select: {
                    id: true, organization_id: true, channel_type: true,
                    channel_config: true, is_active: true, last_used_at: true,
                    created_at: true, updated_at: true,
                },
            });
            if (result) {
                try {
                    result.config = JSON.parse(result.channel_config);
                } catch {
                    result.config = {};
                }
            }
            return result;
        } catch (error) {
            console.error('Error getting channel config:', error);
            return null;
        }
    }

    /**
     * Read this company's stored provider credentials for a channel (parsed).
     * Never expose the return value directly outside this service — only
     * getChannelCredentialsStatus() returns a masked summary to callers.
     */
    async getChannelCredentials(channelType) {
        try {
            const row = await this.prisma.notificationChannel.findFirst({
                where:  { channel_type: channelType },
                select: { credentials: true },
            });
            if (!row?.credentials) return null;
            try {
                return JSON.parse(row.credentials);
            } catch {
                return null;
            }
        } catch (error) {
            console.error('Error getting channel credentials:', error);
            return null;
        }
    }

    async getWasenderServiceForOrg() {
        const creds = await this.getChannelCredentials('whatsapp');
        return new WasenderService(creds?.api_key || null);
    }

    async getEmailServiceForOrg() {
        const creds = await this.getChannelCredentials('email');
        return new EmailService({
            enabled: Boolean(creds?.api_key && creds?.from),
            apiKey:  creds?.api_key || null,
            from:    creds?.from || null,
            locale:  creds?.locale || 'zh-CN',
        });
    }

    /**
     * Save this company's provider credentials for a channel. A blank/omitted
     * field means "keep whatever is already saved" — lets an admin rotate
     * just the from-address without re-entering the API key, for example.
     */
    async setChannelCredentials(channelType, input = {}) {
        try {
            if (!['whatsapp', 'email'].includes(channelType)) {
                return { success: false, error: 'Unsupported channel type' };
            }

            const organizationId = getOrgId();
            const existing = await this.getChannelCredentials(channelType);

            let merged;
            if (channelType === 'whatsapp') {
                const apiKey = input.api_key?.trim() || existing?.api_key || null;
                if (!apiKey) return { success: false, error: 'api_key is required' };
                merged = { api_key: apiKey };
            } else {
                const apiKey = input.api_key?.trim() || existing?.api_key || null;
                const from   = input.from?.trim()    || existing?.from    || null;
                if (!apiKey || !from) return { success: false, error: 'api_key and from are required' };
                merged = { api_key: apiKey, from, locale: input.locale?.trim() || existing?.locale || 'zh-CN' };
            }

            await this.prisma.notificationChannel.upsert({
                where:  { organization_id_channel_type: { organization_id: organizationId, channel_type: channelType } },
                update: { credentials: JSON.stringify(merged) },
                create: {
                    organization_id: organizationId,
                    channel_type:    channelType,
                    channel_config:  JSON.stringify({}),
                    credentials:     JSON.stringify(merged),
                    is_active:       false,
                },
            });
            return { success: true, message: 'Credentials saved successfully' };
        } catch (error) {
            console.error('Error setting channel credentials:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Masked status for the frontend — never the raw key.
     */
    async getChannelCredentialsStatus(channelType) {
        const creds = await this.getChannelCredentials(channelType);
        if (channelType === 'whatsapp') {
            return { configured: !!creds?.api_key, hasApiKey: !!creds?.api_key };
        }
        if (channelType === 'email') {
            return { configured: !!(creds?.api_key && creds?.from), hasApiKey: !!creds?.api_key, from: creds?.from || null };
        }
        return { configured: false, hasApiKey: false };
    }

    async getWhatsappSessionStatus() {
        const wasenderService = await this.getWasenderServiceForOrg();
        return wasenderService.getSessionStatus();
    }

    async getWhatsappConfigStatus() {
        const wasenderService = await this.getWasenderServiceForOrg();
        return wasenderService.getConfigStatus();
    }

    renderMessageTemplate({ subscription, notificationType, channel, language = 'zh-CN' }) {
        try {
            const template = this.getTemplate(notificationType, language, channel);
            if (!template) {
                return {
                    content: this.getDefaultContent(subscription, notificationType, language),
                    subject: this.getDefaultSubject(subscription, notificationType, language),
                };
            }

            const templateData = {
                name:              subscription.name,
                plan:              subscription.plan,
                amount:            subscription.amount,
                currency:          subscription.currency,
                next_billing_date: this.formatDate(subscription.next_billing_date, language),
                payment_method:    subscription.paymentMethod?.label || subscription.payment_method_id,
                status:            subscription.status,
                billing_cycle:     subscription.billing_cycle,
            };

            const replace = (input) => {
                if (!input) return input;
                let out = input;
                Object.keys(templateData).forEach((key) => {
                    out = out.replace(new RegExp(`{{${key}}}`, 'g'), templateData[key] ?? '');
                });
                return out;
            };

            const content = replace(template.content_template);
            const subject = replace(template.subject_template) ||
                this.getDefaultSubject(subscription, notificationType, language);

            return { content, subject };
        } catch (error) {
            console.error('Error rendering template:', error);
            return {
                content: this.getDefaultContent(subscription, notificationType, language),
                subject: this.getDefaultSubject(subscription, notificationType, language),
            };
        }
    }

    getTemplate(notificationType, language, channel) {
        try {
            return getTemplate(notificationType, language, channel);
        } catch (error) {
            console.error('Error getting template:', error);
            return null;
        }
    }

    getDefaultContent(subscription, notificationType, language = 'zh-CN') {
        const msg = {
            renewal_reminder:    `续订提醒: ${subscription.name} 将在 ${this.formatDate(subscription.next_billing_date)} 到期，金额: ${subscription.amount} ${subscription.currency}`,
            expiration_warning:  `过期警告: ${subscription.name} 已在 ${this.formatDate(subscription.next_billing_date)} 过期`,
            renewal_success:     `续订成功: ${subscription.name} 续订成功，金额: ${subscription.amount} ${subscription.currency}`,
            renewal_failure:     `续订失败: ${subscription.name} 续订失败，金额: ${subscription.amount} ${subscription.currency}`,
            subscription_change: `订阅变更: ${subscription.name} 信息已更新`,
        };

        if (language.startsWith('en')) {
            const en = {
                renewal_reminder:    `Renewal reminder: ${subscription.name} will renew on ${this.formatDate(subscription.next_billing_date, 'en-US')}, amount: ${subscription.amount} ${subscription.currency}`,
                expiration_warning:  `Expiration warning: ${subscription.name} expired on ${this.formatDate(subscription.next_billing_date, 'en-US')}`,
                renewal_success:     `Renewal success: ${subscription.name} renewed successfully, amount: ${subscription.amount} ${subscription.currency}`,
                renewal_failure:     `Renewal failure: ${subscription.name} renewal failed, amount: ${subscription.amount} ${subscription.currency}`,
                subscription_change: `Subscription change: ${subscription.name} has been updated`,
            };
            return en[notificationType] || `Subscription notification: ${subscription.name}`;
        }

        return msg[notificationType] || `订阅通知: ${subscription.name}`;
    }

    getDefaultSubject(subscription, notificationType, language = 'zh-CN') {
        const en = language.startsWith('en');
        const subjects = {
            renewal_reminder:    en ? `Renewal Reminder - ${subscription.name}` : `续订提醒 - ${subscription.name}`,
            expiration_warning:  en ? `Subscription Expired - ${subscription.name}` : `订阅已过期 - ${subscription.name}`,
            renewal_success:     en ? `Renewal Successful - ${subscription.name}` : `续订成功 - ${subscription.name}`,
            renewal_failure:     en ? `Renewal Failed - ${subscription.name}` : `续订失败 - ${subscription.name}`,
            subscription_change: en ? `Subscription Updated - ${subscription.name}` : `订阅变更通知 - ${subscription.name}`,
        };
        return subjects[notificationType] || (en ? `Subscription Notification - ${subscription.name}` : `订阅通知 - ${subscription.name}`);
    }

    async createNotificationRecord(data) {
        try {
            return await this.prisma.notificationHistory.create({
                data: {
                    subscription_id:  data.subscriptionId,
                    notification_type: data.notificationType,
                    channel_type:     data.channelType,
                    status:           data.status,
                    recipient:        data.recipient,
                    message_content:  data.messageContent,
                    sent_at:          data.sentAt || null,
                    error_message:    data.errorMessage || null,
                },
            });
        } catch (error) {
            console.error('Error creating notification record:', error);
            throw error;
        }
    }

    async updateChannelLastUsed(channelType) {
        try {
            await this.prisma.notificationChannel.updateMany({
                where: { channel_type: channelType },
                data:  { last_used_at: new Date() },
            });
        } catch (error) {
            console.error('Error updating channel last used time:', error);
        }
    }

    /**
     * Resolve the list of recipients for a channel. Always returns an array —
     * whatsapp can have multiple phone numbers, other channels wrap their
     * single recipient in a 1-element array.
     */
    getRecipients(channelConfig, channel) {
        const cfg = channelConfig.config || {};

        if (channel === 'whatsapp') {
            return Array.isArray(cfg.phone_numbers) ? cfg.phone_numbers.filter(Boolean) : [];
        }

        if (channel === 'email') {
            if (Array.isArray(cfg.email_addresses)) {
                return cfg.email_addresses.filter(Boolean);
            }
            const legacySingle = cfg.email || cfg.address;
            return legacySingle ? [legacySingle] : [];
        }

        const single = cfg.email || cfg.address;
        return single ? [single] : [];
    }

    formatDate(dateString, language = 'zh-CN') {
        try {
            if (!dateString) {
                return language.startsWith('en') ? 'Unknown date' : '未知日期';
            }
            return new Date(dateString).toLocaleDateString(language);
        } catch {
            return String(dateString);
        }
    }

    async configureChannel(channelType, config) {
        try {
            const configJson = JSON.stringify(config);
            const organizationId = getOrgId();
            await this.prisma.notificationChannel.upsert({
                where:  { organization_id_channel_type: { organization_id: organizationId, channel_type: channelType } },
                update: { channel_config: configJson, is_active: true },
                create: { organization_id: organizationId, channel_type: channelType, channel_config: configJson, is_active: true },
            });
            return { success: true, message: 'Channel configured successfully' };
        } catch (error) {
            console.error('Error configuring channel:', error);
            return { success: false, error: error.message };
        }
    }

    async testNotification(channelType) {
        try {
            const channelConfig = await this.getChannelConfig(channelType);
            if (!channelConfig) return { success: false, message: 'Channel not configured' };

            if (channelType === 'whatsapp') {
                const phoneNumbers = this.getRecipients(channelConfig, 'whatsapp');
                if (phoneNumbers.length === 0) return { success: false, message: 'No recipients configured' };

                const wasenderService = await this.getWasenderServiceForOrg();
                const results = await Promise.all(
                    phoneNumbers.map((phoneNumber) => wasenderService.sendTestMessage(phoneNumber))
                );
                return {
                    success:      results.some((r) => r.success),
                    allSucceeded: results.every((r) => r.success),
                    results:      phoneNumbers.map((phoneNumber, i) => ({ recipient: phoneNumber, ...results[i] })),
                };
            }
            if (channelType === 'email') {
                const addresses = this.getRecipients(channelConfig, 'email');
                if (addresses.length === 0) return { success: false, message: 'No recipients configured' };

                const emailService = await this.getEmailServiceForOrg();
                const results = await Promise.all(
                    addresses.map((address) => emailService.sendTestMail(address))
                );
                return {
                    success:      results.some((r) => r.success),
                    allSucceeded: results.every((r) => r.success),
                    results:      addresses.map((address, i) => ({ recipient: address, ...results[i] })),
                };
            }

            return { success: false, message: 'Unsupported channel type' };
        } catch (error) {
            console.error('Error testing notification:', error);
            return { success: false, error: error.message };
        }
    }

    async sendEmailNotification({ recipient, subscription, notificationType, subject, htmlContent, emailService }) {
        if (!emailService.isConfigured()) {
            return { success: false, error: 'Email service not configured' };
        }
        const finalSubject = subject || this.getDefaultSubject(subscription, notificationType);
        const plainText    = this.stripHtml(htmlContent);
        const htmlBody     = /[<>]/.test(htmlContent) ? htmlContent : `<p>${htmlContent}</p>`;

        return emailService.sendMail({
            to:      recipient,
            subject: finalSubject,
            html:    htmlBody,
            text:    plainText,
        });
    }

    async getNotificationHistory(options = {}) {
        try {
            const { page = 1, limit = 20, status, type } = options;
            const offset = (page - 1) * limit;

            const where = {};
            if (status) where.status            = status;
            if (type)   where.notification_type = type;

            const [total, data] = await Promise.all([
                this.prisma.notificationHistory.count({ where }),
                this.prisma.notificationHistory.findMany({
                    where,
                    include: { subscription: { select: { name: true } } },
                    orderBy: { created_at: 'desc' },
                    take:    limit,
                    skip:    offset,
                }),
            ]);

            return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
        } catch (error) {
            console.error('Error getting notification history:', error);
            return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
        }
    }

    stripHtml(html) {
        if (!html) return '';
        return html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<(p|div|hr)[^>]*>/gi, '\n')
            .replace(/<\/(p|div|tr|table|h[1-6]|li)>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&quot;/g, '"')
            .replace(/&middot;/g, '·')
            .replace(/&mdash;/g, '—')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // Kept for API compatibility — Prisma manages connection lifecycle
    close() {}
}

module.exports = NotificationService;
