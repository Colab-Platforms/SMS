/**
 * 通知模板配置
 * 支持多语言和多通知类型
 */

const NOTIFICATION_TEMPLATES = {
  // 续订提醒
  renewal_reminder: {
    'en-US': {
      telegram: {
        content: `<b>Renewal Reminder</b>

📢 <b>{{name}}</b> is about to expire

📅 Expiration date: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Please renew in time to avoid service interruption.`
      },
      email: {
        subject: 'Subscription Renewal Reminder - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" is about to expire.

Subscription Details:
- Service Name: {{name}}
- Expiration Date: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Please renew in time to avoid service interruption.

Thank you!`
      }
    },
    'en-US': {
      telegram: {
        content: `<b>Renewal Reminder</b>

📢 <b>{{name}}</b> is about to expire

📅 Expiration date: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Please renew in time to avoid service interruption.`
      },
      email: {
        subject: 'Subscription Renewal Reminder - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" is about to expire.

Subscription Details:
- Service Name: {{name}}
- Expiration Date: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Please renew in time to avoid service interruption.

Thank you!`
      }
    }
  },

  // 过期警告
  expiration_warning: {
    'en-US': {
      telegram: {
        content: `<b>⚠️ Subscription Expiration Warning</b>

🚨 <b>{{name}}</b> has expired

📅 Expiration date: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Please renew immediately to restore service.`
      },
      email: {
        subject: 'Subscription Expiration Warning - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" has expired.

Subscription Details:
- Service Name: {{name}}
- Expiration Date: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Please renew immediately to restore service.

Thank you!`
      }
    },
    'en-US': {
      telegram: {
        content: `<b>⚠️ Subscription Expiration Warning</b>

🚨 <b>{{name}}</b> has expired

📅 Expiration date: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Please renew immediately to restore service.`
      },
      email: {
        subject: 'Subscription Expiration Warning - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" has expired.

Subscription Details:
- Service Name: {{name}}
- Expiration Date: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Please renew immediately to restore service.

Thank you!`
      }
    }
  },

  // 续订成功
  renewal_success: {
    'en-US': {
      telegram: {
        content: `<b>✅ Renewal Successful</b>

🎉 <b>{{name}}</b> renewed successfully

📅 Next renewal: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Thank you for your renewal!`
      },
      email: {
        subject: 'Renewal Successful - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" has been renewed successfully.

Subscription Details:
- Service Name: {{name}}
- Next Renewal: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Thank you for your renewal!

Thank you!`
      }
    },
    'en-US': {
      telegram: {
        content: `<b>✅ Renewal Successful</b>

🎉 <b>{{name}}</b> renewed successfully

📅 Next renewal: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Thank you for your renewal!`
      },
      email: {
        subject: 'Renewal Successful - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" has been renewed successfully.

Subscription Details:
- Service Name: {{name}}
- Next Renewal: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Thank you for your renewal!

Thank you!`
      }
    }
  },

  // 续订失败
  renewal_failure: {
    'en-US': {
      telegram: {
        content: `<b>❌ Renewal Failed</b>

⚠️ <b>{{name}}</b> renewal failed

📅 Expiration date: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Please check your payment method and try again.`
      },
      email: {
        subject: 'Renewal Failed - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" renewal has failed.

Subscription Details:
- Service Name: {{name}}
- Expiration Date: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Please check your payment method and try again.

Thank you!`
      }
    },
    'en-US': {
      telegram: {
        content: `<b>❌ Renewal Failed</b>

⚠️ <b>{{name}}</b> renewal failed

📅 Expiration date: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Please check your payment method and try again.`
      },
      email: {
        subject: 'Renewal Failed - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" renewal has failed.

Subscription Details:
- Service Name: {{name}}
- Expiration Date: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Please check your payment method and try again.

Thank you!`
      }
    }
  },

  // 订阅变更
  subscription_change: {
    'en-US': {
      telegram: {
        content: `<b>📝 Subscription Change Notification</b>

🔄 <b>{{name}}</b> information updated

📅 Next renewal: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Changes have taken effect.`
      },
      email: {
        subject: 'Subscription Change Notification - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" information has been updated.

Subscription Details:
- Service Name: {{name}}
- Next Renewal: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Changes have taken effect.

Thank you!`
      }
    },
    'en-US': {
      telegram: {
        content: `<b>📝 Subscription Change Notification</b>

🔄 <b>{{name}}</b> information updated

📅 Next renewal: {{next_billing_date}}
💰 Amount: {{amount}} {{currency}}
💳 Payment method: {{payment_method}}
📋 Plan: {{plan}}

Changes have taken effect.`
      },
      email: {
        subject: 'Subscription Change Notification - {{name}}',
        content: `Hello,

Your subscription service "{{name}}" information has been updated.

Subscription Details:
- Service Name: {{name}}
- Next Renewal: {{next_billing_date}}
- Renewal Amount: {{amount}} {{currency}}
- Payment Method: {{payment_method}}
- Subscription Plan: {{plan}}

Changes have taken effect.

Thank you!`
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
function getTemplate(notificationType, language = 'en-US', channel = 'telegram') {
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
