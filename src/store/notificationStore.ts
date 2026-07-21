import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 通知渠道配置类型
export interface NotificationChannelConfig {
  whatsapp?: {
    phone_numbers: string[];
    validated?: boolean;
    lastValidated?: string;
  };
  email?: {
    email_addresses: string[];
    validated?: boolean;
    lastValidated?: string;
  };
}

// 通知配置状态
interface NotificationConfigState {
  // 渠道配置（本地缓存）
  channelConfigs: NotificationChannelConfig;

  // 操作方法
  setWhatsappConfig: (config: { phone_numbers: string[]; validated?: boolean }) => void;
  setEmailConfig: (config: { email_addresses: string[]; validated?: boolean }) => void;
  clearChannelConfig: (channel: 'whatsapp' | 'email') => void;
  clearAllConfigs: () => void;

  // 验证状态管理
  setChannelValidated: (channel: 'whatsapp' | 'email', validated: boolean) => void;
}

const initialState = {
  channelConfigs: {},
};

export const useNotificationStore = create<NotificationConfigState>()(
  persist(
    (set) => ({
      ...initialState,
      
      setWhatsappConfig: (config) => {
        set((state) => ({
          channelConfigs: {
            ...state.channelConfigs,
            whatsapp: {
              ...state.channelConfigs.whatsapp,
              phone_numbers: config.phone_numbers,
              validated: config.validated ?? state.channelConfigs.whatsapp?.validated,
              lastValidated: config.validated ? new Date().toISOString() : state.channelConfigs.whatsapp?.lastValidated,
            },
          },
        }));
      },
      
      setEmailConfig: (config) => {
        set((state) => ({
          channelConfigs: {
            ...state.channelConfigs,
            email: {
              ...state.channelConfigs.email,
              email_addresses: config.email_addresses,
              validated: config.validated ?? state.channelConfigs.email?.validated,
              lastValidated: config.validated ? new Date().toISOString() : state.channelConfigs.email?.lastValidated,
            },
          },
        }));
      },
      
      clearChannelConfig: (channel) => {
        set((state) => {
          const newConfigs = { ...state.channelConfigs };
          delete newConfigs[channel];
          return { channelConfigs: newConfigs };
        });
      },
      
      clearAllConfigs: () => {
        set({ channelConfigs: {} });
      },
      
      setChannelValidated: (channel, validated) => {
        set((state) => {
          const currentConfig = state.channelConfigs[channel];
          if (!currentConfig) return state;
          
          return {
            channelConfigs: {
              ...state.channelConfigs,
              [channel]: {
                ...currentConfig,
                validated,
                lastValidated: validated ? new Date().toISOString() : currentConfig.lastValidated,
              },
            },
          };
        });
      },
    }),
    {
      name: 'notification-config-storage',
      // 只持久化配置数据
      partialize: (state) => ({
        channelConfigs: state.channelConfigs,
      }),
    }
  )
);
