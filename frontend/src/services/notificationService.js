import api from './api';
import { generateMockData } from '@/utils/mockData';

class NotificationService {
  async sendNotification(type, user = null) {
    const mockData = generateMockData(user);
    const data = {
      ...mockData[type],
      timestamp: new Date().toISOString(),
    };
    
    // Use the specific endpoint for each notification type
    const endpoints = {
      signup: '/api/signups',
      login: '/api/logins',
      reset_password: '/api/reset-passwords',
      purchase: '/api/purchases',
      friend_request: '/api/friend-requests',
      friendRequest: '/api/friend-requests'
    };
    
    const endpoint = endpoints[type] || '/api/notifications';
    return api.post(endpoint, data);
  }

  async getNotifications(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const endpoint = `/api/notifications${queryString ? `?${queryString}` : ''}`;
    return api.get(endpoint);
  }

  async getNotificationById(id) {
    return api.get(`/api/notifications/${id}`);
  }

  async updateNotificationStatus(id, status, error = null) {
    return api.patch(`/api/notifications/${id}/status`, { status, error });
  }

  async deleteNotification(id) {
    return api.delete(`/api/notifications/${id}`);
  }

  async getNotificationStats() {
    return api.get('/api/notifications/stats');
  }

  async retryFailedNotifications() {
    return api.post('/api/notifications/retry-failed');
  }

  async getServerStatus() {
    return api.get('/balancer/status');
  }

  async getHealthCheck() {
    return api.get('/api/health');
  }
}

export default new NotificationService();