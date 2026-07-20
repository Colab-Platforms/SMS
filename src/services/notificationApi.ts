import { apiClient } from '@/utils/api-client';

export interface NotificationSetting {
  id: number;
  notification_type: string;
  is_enabled: boolean;
  advance_days: number;
  notification_channels: string[];
  repeat_notification: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationChannel {
  id: number;
  channel_type: string;
  channel_config: Record<string, unknown>;
  config?: Record<string, unknown>; // Parsed config object
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationHistory {
  id: number;
  subscription_id: number;
  notification_type: string;
  channel_type: string;
  status: string;
  recipient: string;
  message_content: string;
  error_message: string | null;
  retry_count: number;
  max_retry: number;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
  subscription_name?: string;
}

export interface NotificationStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  retrying: number;
  byType: Record<string, number>;
  byChannel: Record<string, number>;
}

export type WhatsappSessionStatusValue = 'connected' | 'disconnected' | 'need_scan' | 'logged_out' | 'expired';

export interface WhatsappSessionStatus {
  success: boolean;
  status?: WhatsappSessionStatusValue;
  error?: string;
}

export interface WhatsappConfigStatus {
  configured: boolean;
  hasApiKey: boolean;
  isPlaceholder: boolean;
}

export const notificationApi = {
  // 获取通知设置
  getSettings: () =>
    apiClient.get<NotificationSetting[]>(`/protected/notifications/settings`),

  // 更新通知设置
  updateSetting: (settingId: number, setting: Partial<NotificationSetting>) =>
    apiClient.put<{ message: string }>(`/protected/notifications/settings/${settingId}`, setting),

  // 配置通知渠道
  configureChannel: (channelType: string, config: Record<string, unknown>) =>
    apiClient.post<{ message: string }>(`/protected/notifications/channels`, {
      channel_type: channelType,
      config
    }),

  // 获取渠道配置
  getChannelConfig: (channelType: string) =>
    apiClient.get<NotificationChannel>(`/protected/notifications/channels/${channelType}`),

  // 测试通知
  testNotification: (channelType: string) =>
    apiClient.post(`/protected/notifications/test`, {
      channel_type: channelType
    }),

  // 发送通知
  sendNotification: (data: {
    subscription_id: number;
    notification_type: string;
    channels?: string[];
  }) =>
    apiClient.post(`/protected/notifications/send`, data),

  // 获取通知历
  getHistory: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
  }) => {
    let url = `/notifications/history`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    return apiClient.get<{
      data: NotificationHistory[];
      pagination: {
        page: number;
        limit: number;
        total: number;
      };
    }>(url);
  },



  // 获取通知统计（公开接口）
  getStats: () =>
    apiClient.get<NotificationStats>(`/notifications/stats`),

  // 验证WhatsApp电话号码格式
  validatePhoneNumber: (phoneNumber: string) =>
    apiClient.post(`/protected/notifications/validate-phone-number`, { phone_number: phoneNumber }),

  // 获取WhatsApp会话连接状态
  getWhatsappSessionStatus: () =>
    apiClient.get<WhatsappSessionStatus>(`/protected/notifications/whatsapp/session-status`),

  // 获取WhatsApp配置状态
  getWhatsappConfigStatus: () =>
    apiClient.get<WhatsappConfigStatus>(`/protected/notifications/whatsapp/config-status`)
};