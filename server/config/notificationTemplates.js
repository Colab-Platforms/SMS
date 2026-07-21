/**
 * 通知模板配置
 * 支持多语言和多通知类型
 */

/**
 * Shared HTML shell for notification emails. Produces a colored, card-style
 * layout (inline styles only, table-based details section) so the same
 * markup renders consistently across Gmail/Outlook.com/Apple Mail/mobile
 * clients that don't support external/`<style>` CSS.
 *
 * `{{name}}`, `{{next_billing_date}}`, `{{amount}}`, `{{currency}}`,
 * `{{payment_method}}` and `{{plan}}` tokens are left intact here — they are
 * substituted later by notificationService.js's renderMessageTemplate().
 */
function buildEmailHtml({ icon, accent, accentLight, headline, intro, dateLabel, closing }) {
  return `<div style="max-width:560px;margin:0 auto;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f6f8;padding:24px;">
  <div style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e9ef;">
    <div style="background:${accent};padding:20px 24px;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${icon} ${headline}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 20px;font-size:15px;color:#1f2937;line-height:1.6;">${intro}</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f0f2f5;">Service Name</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;color:#111827;font-size:14px;border-bottom:1px solid #f0f2f5;">{{name}}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f0f2f5;">${dateLabel}</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;color:#111827;font-size:14px;border-bottom:1px solid #f0f2f5;">{{next_billing_date}}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f0f2f5;">Amount</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;color:#111827;font-size:14px;border-bottom:1px solid #f0f2f5;">{{amount}} {{currency}}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:13px;border-bottom:1px solid #f0f2f5;">Payment Method</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;color:#111827;font-size:14px;border-bottom:1px solid #f0f2f5;">{{payment_method}}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6b7280;font-size:13px;">Plan</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;color:#111827;font-size:14px;">{{plan}}</td>
        </tr>
      </table>
      <div style="background:${accentLight};border-left:4px solid ${accent};border-radius:6px;padding:14px 16px;">
        <p style="margin:0;font-size:14px;color:#1f2937;line-height:1.5;">${closing}</p>
      </div>
    </div>
    <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e9ef;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Subscription Manager &middot; Automated notification &mdash; please do not reply</p>
    </div>
  </div>
</div>`;
}

const NOTIFICATION_TEMPLATES = {
  // 续订提醒
  renewal_reminder: {
    'en-US': {
      whatsapp: {
        content: `*Renewal Reminder*

📢 *{{name}}* is about to expire

📅 Expiration date: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Please renew in time to avoid service interruption.`
      },
      email: {
        subject: '🔔 Subscription Renewal Reminder - {{name}}',
        content: buildEmailHtml({
          icon: '🔔',
          accent: '#3B82F6',
          accentLight: '#EFF6FF',
          headline: 'Renewal Reminder',
          intro: 'Your subscription service &quot;{{name}}&quot; is about to expire.',
          dateLabel: 'Expiration Date',
          closing: 'Please renew in time to avoid service interruption.'
        })
      }
    }
  },

  // 过期警告
  expiration_warning: {
    'en-US': {
      whatsapp: {
        content: `*⚠️ Subscription Expiration Warning*

🚨 *{{name}}* has expired

📅 Expiration date: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Please renew immediately to restore service.`
      },
      email: {
        subject: '⚠️ Subscription Expiration Warning - {{name}}',
        content: buildEmailHtml({
          icon: '⚠️',
          accent: '#F97316',
          accentLight: '#FFF7ED',
          headline: 'Subscription Expired',
          intro: 'Your subscription service &quot;{{name}}&quot; has expired.',
          dateLabel: 'Expiration Date',
          closing: 'Please renew immediately to restore service.'
        })
      }
    }
  },

  // 续订成功
  renewal_success: {
    'en-US': {
      whatsapp: {
        content: `*✅ Renewal Successful*

🎉 *{{name}}* renewed successfully

📅 Next renewal: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Thank you for your renewal!`
      },
      email: {
        subject: '✅ Renewal Successful - {{name}}',
        content: buildEmailHtml({
          icon: '✅',
          accent: '#10B981',
          accentLight: '#ECFDF5',
          headline: 'Renewal Successful',
          intro: 'Your subscription service &quot;{{name}}&quot; has been renewed successfully.',
          dateLabel: 'Next Renewal',
          closing: 'Thank you for your renewal!'
        })
      }
    }
  },

  // 续订失败
  renewal_failure: {
    'en-US': {
      whatsapp: {
        content: `*❌ Renewal Failed*

⚠️ *{{name}}* renewal failed

📅 Expiration date: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Please check your payment method and try again.`
      },
      email: {
        subject: '❌ Renewal Failed - {{name}}',
        content: buildEmailHtml({
          icon: '❌',
          accent: '#EF4444',
          accentLight: '#FEF2F2',
          headline: 'Renewal Failed',
          intro: 'Your subscription service &quot;{{name}}&quot; renewal has failed.',
          dateLabel: 'Expiration Date',
          closing: 'Please check your payment method and try again.'
        })
      }
    }
  },

  // 订阅变更
  subscription_change: {
    'en-US': {
      whatsapp: {
        content: `*📝 Subscription Change Notification*

🔄 *{{name}}* information updated

📅 Next renewal: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Changes have taken effect.`
      },
      email: {
        subject: '📝 Subscription Change Notification - {{name}}',
        content: buildEmailHtml({
          icon: '📝',
          accent: '#6366F1',
          accentLight: '#EEF2FF',
          headline: 'Subscription Updated',
          intro: 'Your subscription service &quot;{{name}}&quot; information has been updated.',
          dateLabel: 'Next Renewal',
          closing: 'Changes have taken effect.'
        })
      }
    }
  }
};

/**
 * 获取通知模板
 * @param {string} notificationType - 通知类型
 * @param {string} language - 语言代码
 * @param {string} channel - 通知渠道
 * @returns {Object|null} 模板对象
 */
function getTemplate(notificationType, language = 'en-US', channel = 'whatsapp') {
  const typeTemplates = NOTIFICATION_TEMPLATES[notificationType];
  if (!typeTemplates) {
    return null;
  }

  // 尝试获取指定语言的模板
  let langTemplates = typeTemplates[language];
  if (!langTemplates) {
    // 语言回退机制
    const fallbackLanguages = ['en-US', 'zh-CN'];
    for (const fallbackLang of fallbackLanguages) {
      if (fallbackLang !== language && typeTemplates[fallbackLang]) {
        langTemplates = typeTemplates[fallbackLang];
        console.log(`Template fallback: ${language} -> ${fallbackLang} for ${notificationType}`);
        break;
      }
    }
  }

  if (!langTemplates) {
    return null;
  }

  const channelTemplate = langTemplates[channel];
  if (!channelTemplate) {
    return null;
  }

  return {
    notification_type: notificationType,
    language,
    channel_type: channel,
    subject_template: channelTemplate.subject || null,
    content_template: channelTemplate.content
  };
}

/**
 * 获取支持的语言列表
 * @returns {Array} 支持的语言代码数组
 */
function getSupportedLanguages() {
  const languages = new Set();
  Object.values(NOTIFICATION_TEMPLATES).forEach(typeTemplates => {
    Object.keys(typeTemplates).forEach(lang => languages.add(lang));
  });
  return Array.from(languages);
}

/**
 * 获取支持的通知类型列表
 * @returns {Array} 支持的通知类型数组
 */
function getSupportedNotificationTypes() {
  return Object.keys(NOTIFICATION_TEMPLATES);
}

/**
 * 获取支持的渠道列表
 * @param {string} notificationType - 通知类型
 * @param {string} language - 语言代码
 * @returns {Array} 支持的渠道数组
 */
function getSupportedChannels(notificationType, language = 'en-US') {
  const typeTemplates = NOTIFICATION_TEMPLATES[notificationType];
  if (!typeTemplates || !typeTemplates[language]) {
    return [];
  }
  return Object.keys(typeTemplates[language]);
}

module.exports = {
  NOTIFICATION_TEMPLATES,
  getTemplate,
  getSupportedLanguages,
  getSupportedNotificationTypes,
  getSupportedChannels
};
