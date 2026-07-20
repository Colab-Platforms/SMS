const axios = require('axios');

/**
 * WasenderAPI (WhatsApp) service wrapper.
 * Sends messages through a WhatsApp number connected to WasenderAPI
 * (connected via QR code on the WasenderAPI dashboard — external, one-time, manual).
 */
class WasenderService {
    constructor() {
        this.apiKey = process.env.WASENDER_API_KEY;
        this.apiBaseUrl = 'https://www.wasenderapi.com/api';
        this.client = axios.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
        });
    }

    /**
     * Send a WhatsApp text message.
     * @param {string} phoneNumber - Recipient phone number in E.164 format (e.g. +14155552671)
     * @param {string} text - Message content
     * @returns {Promise<Object>} Send result
     */
    async sendMessage(phoneNumber, text) {
        try {
            if (!this.apiKey) {
                throw new Error('WasenderAPI API key not configured');
            }

            if (!phoneNumber) {
                throw new Error('Phone number is required');
            }

            const response = await this.client.post(`${this.apiBaseUrl}/send-message`, {
                to: phoneNumber,
                text,
            });

            const data = response.data?.data || {};
            return {
                success: true,
                messageId: data.msgId,
                jid: data.jid,
                status: data.status,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            console.error('WasenderAPI notification failed:', error);
            return {
                success: false,
                error: error.response?.data?.message || error.response?.data?.error || error.message,
            };
        }
    }

    /**
     * Get the connection status of the linked WhatsApp session.
     * @returns {Promise<Object>} Session status result
     */
    async getSessionStatus() {
        try {
            if (!this.apiKey) {
                return { success: false, error: 'WasenderAPI API key not configured' };
            }

            const response = await this.client.get(`${this.apiBaseUrl}/status`);
            return { success: true, status: response.data?.status || response.data?.data?.status };
        } catch (error) {
            return {
                success: false,
                error: error.response?.data?.message || error.response?.data?.error || error.message,
            };
        }
    }

    /**
     * Send a canned test message to verify configuration.
     * @param {string} phoneNumber - Recipient phone number in E.164 format
     */
    async sendTestMessage(phoneNumber) {
        const testMessage = `🔔 *Subscription Manager Test Message*

This is a test message from the Subscription Manager.

If you received this message, your WhatsApp notification channel is configured correctly!

⏰ Sent at: ${new Date().toLocaleString('en-US')}

If you have any questions, please contact your administrator.`;

        return await this.sendMessage(phoneNumber, testMessage);
    }

    /**
     * Validate a phone number is in E.164 format.
     * WasenderAPI has no endpoint to validate an arbitrary recipient number,
     * so this is a local format check only.
     * @param {string} phoneNumber
     * @returns {boolean}
     */
    isValidPhoneNumber(phoneNumber) {
        return typeof phoneNumber === 'string' && /^\+[1-9]\d{6,14}$/.test(phoneNumber);
    }

    /**
     * Check if the API key is configured.
     * @returns {boolean}
     */
    isConfigured() {
        return !!this.apiKey && this.apiKey !== 'your_wasender_api_key_here';
    }

    /**
     * Get configuration status.
     * @returns {Object}
     */
    getConfigStatus() {
        return {
            configured: this.isConfigured(),
            hasApiKey: !!this.apiKey,
            isPlaceholder: this.apiKey === 'your_wasender_api_key_here' || !this.apiKey,
        };
    }
}

module.exports = WasenderService;
