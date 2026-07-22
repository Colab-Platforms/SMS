const axios = require('axios');
const config = require('../config');

/**
 * Email notification service wrapper — sends via Resend's HTTPS API.
 * Deliberately not raw SMTP: many hosts (Railway included) block or silently
 * drop outbound SMTP connections, which left the old nodemailer transport
 * hanging until a connection timeout on every send.
 */
class EmailService {
  constructor(options = null) {
    this.config = options || config.getEmailConfig();
    this.baseUrl = 'https://api.resend.com/emails';
  }

  isConfigured() {
    return Boolean(this.config.enabled);
  }

  getDefaultFrom() {
    return this.config.from;
  }

  /**
   * Send an email via the Resend API.
   * @param {Object} mail - Mail payload
   * @param {string} mail.to - Recipient email address
   * @param {string} mail.subject - Subject line
   * @param {string} mail.html - HTML content
   * @param {string} [mail.text] - Plain text fallback
   * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
   */
  async sendMail({ to, subject, html, text }) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const response = await axios.post(
        this.baseUrl,
        { from: this.getDefaultFrom(), to, subject, html, text },
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      return { success: true, messageId: response.data.id };
    } catch (error) {
      const message = error.response
        ? `Resend API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        : error.request
          ? 'Network error: unable to reach Resend API'
          : error.message;
      console.error('Email notification failed:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Send a canned test message to verify configuration.
   * @param {string} to - Recipient email address
   */
  async sendTestMail(to) {
    const now = new Date().toLocaleString(this.config.locale || 'en-US');
    const subject = 'Subscription Manager Test';
    const html = `
      <h2>Subscription Manager Test</h2>
      <p>This is a test email from the Subscription Manager. If you received this email, it means the email notification channel is configured correctly.</p>
      <hr/>
      <p><strong>Send time:</strong> ${now}</p>
      <p>Thank you for using our service!</p>
    `;
    const text = `Subscription Manager Test\n\nThis is a test email from the Subscription Manager. If you received this email, it means the email notification channel is configured correctly.\n\nSend time: ${now}`;

    return this.sendMail({ to, subject, html, text });
  }
}

module.exports = EmailService;
