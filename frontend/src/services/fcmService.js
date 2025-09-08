import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { messaging, VAPID_KEY } from '@/config/firebase';
import api from './api';

class FCMService {
  constructor() {
    this.currentToken = null;
    this.tokenRefreshInterval = null;
    this.messageListener = null;
  }

  /**
   * Initialize FCM and request permission
   */
  async initialize(userId) {
    try {
      if (!messaging) {
        console.warn('Firebase Messaging is not supported in this browser');
        return false;
      }

      // Request notification permission
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return false;
      }

      // Register service worker
      await this.registerServiceWorker();

      // Get FCM token
      const token = await this.getToken();
      if (!token) {
        console.error('Failed to get FCM token');
        return false;
      }

      // Register token with backend
      await this.registerTokenWithBackend(token, userId);

      // Set up message listener
      this.setupMessageListener();

      // Set up token refresh
      this.setupTokenRefresh(userId);

      console.log('FCM Service initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize FCM:', error);
      return false;
    }
  }

  /**
   * Request notification permission
   */
  async requestPermission() {
    try {
      const permission = await Notification.requestPermission();
      console.log('Notification permission:', permission);
      return permission;
    } catch (error) {
      console.error('Failed to request permission:', error);
      return 'denied';
    }
  }

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        // Update service worker with Firebase config
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Service Worker registered:', registration);
        
        // Send Firebase config to service worker
        if (registration.active) {
          registration.active.postMessage({
            type: 'UPDATE_FIREBASE_CONFIG',
            config: {
              apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
              authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
              projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
              storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
              messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
              appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
            }
          });
        }
        
        return registration;
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        throw error;
      }
    }
  }

  /**
   * Get FCM token
   */
  async getToken() {
    try {
      if (!messaging) {
        console.warn('Messaging not initialized');
        return null;
      }

      const currentToken = await getToken(messaging, { 
        vapidKey: VAPID_KEY 
      });

      if (currentToken) {
        console.log('FCM Token obtained:', currentToken);
        this.currentToken = currentToken;
        
        // Store in localStorage for persistence
        localStorage.setItem('fcmToken', currentToken);
        localStorage.setItem('fcmTokenTimestamp', Date.now().toString());
        
        return currentToken;
      } else {
        console.log('No registration token available');
        return null;
      }
    } catch (error) {
      console.error('An error occurred while retrieving token:', error);
      return null;
    }
  }

  /**
   * Register token with backend
   */
  async registerTokenWithBackend(token, userId) {
    try {
      const deviceInfo = this.getDeviceInfo();
      
      const response = await api.post('/api/fcm-tokens', {
        token,
        userId,
        deviceInfo,
        permissions: {
          notifications: true,
          purchase: true,
          friendRequest: true,
          login: true,
          marketing: false
        }
      });

      console.log('Token registered with backend:', response);
      return response;
    } catch (error) {
      console.error('Failed to register token with backend:', error);
      throw error;
    }
  }

  /**
   * Get device information
   */
  getDeviceInfo() {
    const userAgent = navigator.userAgent;
    let browser = 'Unknown';
    let browserVersion = 'Unknown';
    let os = 'Unknown';

    // Detect browser
    if (userAgent.indexOf('Firefox') > -1) {
      browser = 'Firefox';
      browserVersion = userAgent.match(/Firefox\/(\d+\.\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.indexOf('Chrome') > -1) {
      browser = 'Chrome';
      browserVersion = userAgent.match(/Chrome\/(\d+\.\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.indexOf('Safari') > -1) {
      browser = 'Safari';
      browserVersion = userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || 'Unknown';
    } else if (userAgent.indexOf('Edge') > -1) {
      browser = 'Edge';
      browserVersion = userAgent.match(/Edge\/(\d+\.\d+)/)?.[1] || 'Unknown';
    }

    // Detect OS
    if (userAgent.indexOf('Windows') > -1) {
      os = 'Windows';
    } else if (userAgent.indexOf('Mac') > -1) {
      os = 'macOS';
    } else if (userAgent.indexOf('Linux') > -1) {
      os = 'Linux';
    } else if (userAgent.indexOf('Android') > -1) {
      os = 'Android';
    } else if (userAgent.indexOf('iOS') > -1) {
      os = 'iOS';
    }

    return {
      platform: 'web',
      browser,
      browserVersion,
      os,
      userAgent
    };
  }

  /**
   * Set up message listener for foreground notifications
   */
  setupMessageListener() {
    if (!messaging) return;

    this.messageListener = onMessage(messaging, (payload) => {
      console.log('Message received in foreground:', payload);
      
      // Create custom notification or update UI
      this.handleForegroundMessage(payload);
    });
  }

  /**
   * Handle foreground messages
   */
  handleForegroundMessage(payload) {
    // Show custom notification toast
    const notification = {
      id: Date.now().toString(),
      title: payload.notification?.title || 'New Notification',
      body: payload.notification?.body || 'You have a new notification',
      image: payload.notification?.image,
      type: payload.data?.type || 'info',
      timestamp: new Date().toISOString(),
      data: payload.data
    };

    // Dispatch custom event for the app to handle
    window.dispatchEvent(new CustomEvent('push-notification', {
      detail: notification
    }));

    // Show browser notification if the page is not visible
    if (document.hidden) {
      this.showNotification(notification);
    }
  }

  /**
   * Show browser notification
   */
  showNotification(notification) {
    if (Notification.permission === 'granted') {
      const notif = new Notification(notification.title, {
        body: notification.body,
        icon: notification.image || '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: notification.type,
        data: notification.data
      });

      notif.onclick = () => {
        window.focus();
        notif.close();
        
        // Navigate to click action if provided
        if (notification.data?.clickAction) {
          window.location.href = notification.data.clickAction;
        }
      };
    }
  }

  /**
   * Set up token refresh
   */
  setupTokenRefresh(userId) {
    // Check token every hour
    this.tokenRefreshInterval = setInterval(async () => {
      await this.refreshToken(userId);
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Refresh FCM token
   */
  async refreshToken(userId) {
    try {
      const oldToken = this.currentToken;
      const newToken = await this.getToken();
      
      if (newToken && newToken !== oldToken) {
        // Token has changed, update backend
        await api.post('/api/fcm-tokens/refresh', {
          oldToken,
          newToken
        });
        
        console.log('FCM token refreshed');
      }
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
  }

  /**
   * Delete FCM token
   */
  async deleteToken() {
    try {
      if (!messaging) return;

      await deleteToken(messaging);
      
      // Remove from backend
      if (this.currentToken) {
        await api.delete(`/api/fcm-tokens/${encodeURIComponent(this.currentToken)}`);
      }
      
      // Clear local storage
      localStorage.removeItem('fcmToken');
      localStorage.removeItem('fcmTokenTimestamp');
      
      this.currentToken = null;
      console.log('FCM token deleted');
    } catch (error) {
      console.error('Failed to delete token:', error);
    }
  }

  /**
   * Update notification permissions
   */
  async updatePermissions(permissions) {
    try {
      if (!this.currentToken) {
        console.warn('No current token to update permissions');
        return;
      }

      await api.patch(`/api/fcm-tokens/${encodeURIComponent(this.currentToken)}/permissions`, {
        permissions
      });

      console.log('Notification permissions updated');
    } catch (error) {
      console.error('Failed to update permissions:', error);
    }
  }

  /**
   * Check if notifications are supported
   */
  isSupported() {
    return 'Notification' in window && 
           'serviceWorker' in navigator && 
           'PushManager' in window;
  }

  /**
   * Get notification permission status
   */
  getPermissionStatus() {
    if (!this.isSupported()) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  /**
   * Clean up service
   */
  cleanup() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
    
    if (this.messageListener) {
      this.messageListener();
      this.messageListener = null;
    }
  }
}

export default new FCMService();