import { useState, useEffect, useCallback } from 'react';
import fcmService from '@/services/fcmService';
import api from '@/services/api';

export const usePushNotifications = (userId) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('default');
  const [token, setToken] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Check initial status
  useEffect(() => {
    const checkStatus = () => {
      const status = fcmService.getPermissionStatus();
      setPermissionStatus(status);
      
      const storedToken = localStorage.getItem('fcmToken');
      if (storedToken) {
        setToken(storedToken);
        setIsInitialized(true);
      }
    };

    checkStatus();
  }, []);

  // Listen for push notifications
  useEffect(() => {
    const handlePushNotification = (event) => {
      const notification = event.detail;
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    };

    window.addEventListener('push-notification', handlePushNotification);
    
    return () => {
      window.removeEventListener('push-notification', handlePushNotification);
    };
  }, []);

  // Initialize push notifications
  const initialize = useCallback(async () => {
    if (!userId) {
      setError('User ID is required to initialize push notifications');
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const success = await fcmService.initialize(userId);
      
      if (success) {
        setIsInitialized(true);
        setPermissionStatus('granted');
        const currentToken = localStorage.getItem('fcmToken');
        setToken(currentToken);
        return true;
      } else {
        setError('Failed to initialize push notifications');
        const status = fcmService.getPermissionStatus();
        setPermissionStatus(status);
        return false;
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
      console.error('Push notification initialization error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Disable push notifications
  const disable = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await fcmService.deleteToken();
      setIsInitialized(false);
      setToken(null);
      setPermissionStatus('default');
    } catch (err) {
      setError(err.message || 'Failed to disable notifications');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh token
  const refreshToken = useCallback(async () => {
    if (!userId) return;
    
    setIsLoading(true);
    setError(null);

    try {
      await fcmService.refreshToken(userId);
      const newToken = localStorage.getItem('fcmToken');
      setToken(newToken);
    } catch (err) {
      setError(err.message || 'Failed to refresh token');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Update permissions
  const updatePermissions = useCallback(async (permissions) => {
    try {
      await fcmService.updatePermissions(permissions);
    } catch (err) {
      setError(err.message || 'Failed to update permissions');
    }
  }, []);

  // Fetch notification history
  const fetchHistory = useCallback(async () => {
    if (!userId) return;
    
    try {
      const response = await api.get(`/api/push-notifications/user/${userId}`);
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to fetch notification history:', err);
    }
  }, [userId]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await api.patch(`/api/push-notifications/${notificationId}/read`);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    
    try {
      await api.patch(`/api/push-notifications/user/${userId}/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }, [userId]);

  // Clear notification history
  const clearHistory = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Test push notification
  const sendTestNotification = useCallback(async (type = 'test') => {
    if (!userId) return;
    
    try {
      const response = await api.post('/api/push-notifications/test', {
        userId,
        type,
        title: 'Test Notification',
        body: `This is a test ${type} notification`,
        data: {
          clickAction: '/test',
          timestamp: new Date().toISOString()
        }
      });
      
      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to send test notification');
      throw err;
    }
  }, [userId]);

  return {
    // State
    isInitialized,
    isLoading,
    error,
    permissionStatus,
    token,
    notifications,
    unreadCount,
    
    // Actions
    initialize,
    disable,
    refreshToken,
    updatePermissions,
    fetchHistory,
    markAsRead,
    markAllAsRead,
    clearHistory,
    sendTestNotification,
    
    // Computed
    isSupported: fcmService.isSupported(),
    canEnable: permissionStatus !== 'denied' && permissionStatus !== 'unsupported',
    isDenied: permissionStatus === 'denied',
    isGranted: permissionStatus === 'granted'
  };
};