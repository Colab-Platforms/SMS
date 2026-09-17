import { apiClient } from '@/utils/api-client';

export interface Organization {
  id: number;
  name: string;
}

export interface AuthUser {
  id: number;
  username: string;
  role?: string;
  organizationId: number;
  organizationName: string;
}

export const authApi = {
  async me(): Promise<{ user: AuthUser }> {
    return apiClient.get('/auth/me');
  },
  async getOrganizations(): Promise<{ organizations: Organization[] }> {
    return apiClient.get('/auth/organizations');
  },
  async login(organizationId: number, username: string, password: string): Promise<{ message: string }> {
    return apiClient.post('/auth/login', { organizationId, username, password });
  },
  async logout(): Promise<{ message: string }> {
    return apiClient.post('/auth/logout', {});
  },
  async changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword?: string }): Promise<{ message: string }> {
    return apiClient.post('/auth/change-password', payload);
  },
};
