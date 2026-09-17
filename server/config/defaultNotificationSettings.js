// Default per-notification-type settings applied to every newly created
// organization. Shared by server/scripts/create-organization.js.
const DEFAULT_NOTIFICATION_SETTINGS = [
    { notification_type: 'renewal_reminder',    is_enabled: true, advance_days: 7, repeat_notification: true,  notification_channels: '["whatsapp"]' },
    { notification_type: 'expiration_warning',  is_enabled: true, advance_days: 0, repeat_notification: false, notification_channels: '["whatsapp"]' },
    { notification_type: 'renewal_success',     is_enabled: true, advance_days: 0, repeat_notification: false, notification_channels: '["whatsapp"]' },
    { notification_type: 'renewal_failure',     is_enabled: true, advance_days: 0, repeat_notification: false, notification_channels: '["whatsapp"]' },
    { notification_type: 'subscription_change', is_enabled: true, advance_days: 0, repeat_notification: false, notification_channels: '["whatsapp"]' },
];

module.exports = { DEFAULT_NOTIFICATION_SETTINGS };
