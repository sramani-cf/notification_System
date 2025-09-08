const admin = require('firebase-admin');
const config = require('../config');
const logger = require('../utils/logger');
const PushNotification = require('../models/pushNotification.model');
const FcmToken = require('../models/fcmToken.model');
const queueManager = require('../queues');

class PushNotificationService {
  constructor() {
    this.isInitialized = false;
    this.firebaseApp = null;
    this.messaging = null;
  }

  async initialize() {
    try {
      logger.info('Initializing push notification service...', 'PUSH-SERVICE');
      
      // Initialize Firebase Admin SDK
      if (!config.firebase.projectId || !config.firebase.privateKey || !config.firebase.clientEmail) {
        logger.warn('Firebase configuration missing. Push notifications will be disabled.', 'PUSH-SERVICE');
        this.isInitialized = false;
        return false;
      }

      // Check if Firebase is already initialized
      if (admin.apps.length > 0) {
        this.firebaseApp = admin.app();
      } else {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: config.firebase.projectId,
            privateKey: config.firebase.privateKey,
            clientEmail: config.firebase.clientEmail
          }),
          databaseURL: config.firebase.databaseURL
        });
      }

      this.messaging = admin.messaging();
      this.isInitialized = true;
      
      logger.success('Push notification service initialized successfully', 'PUSH-SERVICE');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize push notification service: ${error.message}`, 'PUSH-SERVICE');
      this.isInitialized = false;
      return false;
    }
  }

  isReady() {
    return this.isInitialized && this.messaging !== null;
  }

  /**
   * Send push notification - main entry point
   */
  async sendPushNotification(type, data, options = {}) {
    try {
      if (!this.isReady()) {
        throw new Error('Push notification service not ready - check Firebase configuration');
      }

      // Validate notification type
      const validTypes = ['signup', 'login', 'reset_password', 'purchase', 'friend_request'];
      if (!validTypes.includes(type)) {
        throw new Error(`Invalid notification type: ${type}`);
      }

      // Create push notification record
      const notification = await this.createNotificationRecord(type, data, options);

      // Prepare job data for queue
      const jobData = {
        type: type,
        notificationId: notification._id.toString(),
        userId: data.userId,
        priority: this.getNotificationPriority(type),
        serverInfo: options.serverInfo || 'PUSH-SERVICE',
        createdAt: new Date().toISOString()
      };

      // Add to push queue
      const job = await queueManager.addPushJob('push', jobData, {
        priority: this.getNotificationPriority(type),
        delay: options.delay || 0
      });

      logger.success(`Push notification queued successfully: ${job.id}`, 'PUSH-SERVICE');

      return {
        success: true,
        notificationId: notification._id.toString(),
        jobId: job.id,
        type: type,
        recipient: data.userId,
        queueName: 'push'
      };

    } catch (error) {
      logger.error(`Failed to send push notification: ${error.message}`, 'PUSH-SERVICE');
      throw error;
    }
  }

  /**
   * Create notification record in database
   */
  async createNotificationRecord(type, data, options) {
    try {
      const notificationData = {
        type: type,
        recipient: {
          userId: data.userId,
          username: data.username || null,
          email: data.email || null
        },
        title: this.generateTitle(type, data),
        body: this.generateBody(type, data),
        data: new Map(Object.entries(data || {})),
        imageUrl: data.imageUrl || this.getDefaultImage(type),
        clickAction: data.clickAction || this.getDefaultClickAction(type),
        priority: this.getNotificationPriority(type) >= 5 ? 'high' : 'normal',
        status: 'pending',
        queueName: 'push',
        metadata: {
          serverInfo: options.serverInfo,
          processedBy: `${options.serverInfo || 'PUSH-SERVICE'}-${Date.now()}`,
          originalData: new Map(Object.entries(data || {}))
        },
        assignedServer: options.serverInfo,
        // Add source tracking
        source: {
          type: options.sourceType || (type === 'purchase' ? 'purchase' : 'api'),
          referenceId: options.sourceId || data.purchaseId || null,
          referenceModel: options.sourceModel || (type === 'purchase' ? 'Purchase' : null),
          triggerDetails: {
            endpoint: options.endpoint || '/api/notifications',
            userAgent: options.userAgent || null,
            ipAddress: options.ipAddress || null,
            timestamp: new Date()
          }
        }
      };

      const notification = new PushNotification(notificationData);
      await notification.save();

      return notification;
    } catch (error) {
      logger.error(`Failed to create notification record: ${error.message}`, 'PUSH-SERVICE');
      throw error;
    }
  }

  /**
   * Generate notification title based on type
   */
  generateTitle(type, data) {
    const titles = {
      signup: 'Welcome to Notification System!',
      login: '🔐 New Login Alert',
      reset_password: '🔑 Password Reset Request',
      purchase: '🛍️ Purchase Confirmation',
      friend_request: '👥 New Friend Request'
    };

    return titles[type] || 'New Notification';
  }

  /**
   * Generate notification body based on type
   */
  generateBody(type, data) {
    switch (type) {
      case 'signup':
        return `Welcome ${data.username || 'User'}! Your account has been successfully created.`;
      
      case 'login':
        return `New login detected from ${data.ipAddress || 'unknown location'} at ${new Date(data.loginTime || Date.now()).toLocaleString()}`;
      
      case 'reset_password':
        return data.resetToken 
          ? `Your password reset code is: ${data.resetToken}`
          : 'A password reset link has been sent to your email.';
      
      case 'purchase':
        return `Your purchase of ${data.currency || '$'}${data.totalAmount} has been processed successfully. Order ID: ${data.orderId}`;
      
      case 'friend_request':
        return `${data.fromUsername} sent you a friend request: "${data.message || 'Let\'s connect!'}"`;
      
      default:
        return 'You have a new notification';
    }
  }

  /**
   * Get default image URL for notification type
   */
  getDefaultImage(type) {
    const images = {
      signup: '/images/welcome.png',
      login: '/images/security.png',
      reset_password: '/images/password.png',
      purchase: '/images/purchase.png',
      friend_request: '/images/friend.png'
    };

    return images[type] || '/images/notification.png';
  }

  /**
   * Get default click action URL for notification type
   */
  getDefaultClickAction(type) {
    const actions = {
      signup: '/dashboard',
      login: '/security',
      reset_password: '/reset-password',
      purchase: '/orders',
      friend_request: '/friends'
    };

    return actions[type] || '/';
  }

  /**
   * Get notification priority based on type
   */
  getNotificationPriority(type) {
    const priorities = {
      reset_password: 10,  // Highest priority
      purchase: 8,          // High priority
      signup: 5,            // Medium priority
      login: 3,             // Lower priority
      friend_request: 2     // Lowest priority
    };

    return priorities[type] || 1;
  }

  /**
   * Send test push notification
   */
  async sendTestNotification(userId, token = null) {
    try {
      if (!this.isReady()) {
        throw new Error('Push notification service not ready');
      }

      let fcmToken = token;
      
      // If no token provided, get user's active token
      if (!fcmToken) {
        const tokens = await FcmToken.findActiveTokensForUser(userId);
        if (tokens.length === 0) {
          throw new Error(`No active FCM tokens found for user ${userId}`);
        }
        fcmToken = tokens[0].token;
      }

      // Send test notification directly
      const message = {
        notification: {
          title: '🔔 Test Notification',
          body: 'This is a test push notification from the Notification System!'
        },
        data: {
          type: 'test',
          timestamp: new Date().toISOString(),
          userId: userId.toString()
        },
        token: fcmToken
      };

      const response = await this.messaging.send(message);
      
      logger.success(`Test notification sent successfully: ${response}`, 'PUSH-SERVICE');
      
      return {
        success: true,
        messageId: response,
        token: fcmToken
      };

    } catch (error) {
      logger.error(`Failed to send test notification: ${error.message}`, 'PUSH-SERVICE');
      throw error;
    }
  }

  /**
   * Send batch push notifications
   */
  async sendBatchNotifications(notifications) {
    if (!this.isReady()) {
      throw new Error('Push notification service not ready');
    }

    logger.info(`Processing batch of ${notifications.length} push notifications`, 'PUSH-SERVICE');

    const results = [];
    const errors = [];

    for (const notification of notifications) {
      try {
        const result = await this.sendPushNotification(
          notification.type,
          notification.data,
          notification.options || {}
        );
        results.push(result);
      } catch (error) {
        errors.push({
          notification,
          error: error.message
        });
        logger.error(`Failed to process batch notification: ${error.message}`, 'PUSH-SERVICE');
      }
    }

    return {
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Get push notification statistics
   */
  async getStatistics() {
    try {
      const [notificationStats, tokenStats, queueStats] = await Promise.all([
        PushNotification.getStatistics(),
        FcmToken.getTokenStatistics(),
        queueManager.getQueueStats()
      ]);

      return {
        notifications: notificationStats,
        tokens: tokenStats,
        queues: {
          push: queueStats.push || {},
          pushRetry1: queueStats.pushRetry1 || {},
          pushRetry2: queueStats.pushRetry2 || {},
          pushDlq: queueStats.pushDlq || {}
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get push notification statistics: ${error.message}`, 'PUSH-SERVICE');
      throw error;
    }
  }

  /**
   * Retry failed push notifications
   */
  async retryFailedNotifications(maxRetries = 10) {
    try {
      const failedNotifications = await PushNotification.find({
        status: 'failed',
        attempts: { $lt: 3 }
      }).limit(maxRetries);

      let retriedCount = 0;

      for (const notification of failedNotifications) {
        try {
          // Reset notification for retry
          notification.status = 'pending';
          notification.attempts = 0;
          notification.timestamps.lastAttemptAt = null;
          notification.failureReason = null;
          await notification.save();

          // Re-queue the notification
          const jobData = {
            type: notification.type,
            notificationId: notification._id.toString(),
            userId: notification.recipient.userId,
            serverInfo: 'RETRY-SERVICE',
            processedBy: `RETRY-SERVICE-${Date.now()}`
          };

          await queueManager.addPushJob('push', jobData);
          retriedCount++;

          logger.info(`Retried failed push notification ${notification._id}`, 'PUSH-SERVICE');
        } catch (error) {
          logger.error(`Failed to retry notification ${notification._id}: ${error.message}`, 'PUSH-SERVICE');
        }
      }

      return { retriedCount, totalFailed: failedNotifications.length };
    } catch (error) {
      logger.error(`Failed to retry failed notifications: ${error.message}`, 'PUSH-SERVICE');
      throw error;
    }
  }

  /**
   * Clean up old push notifications
   */
  async cleanupOldNotifications(daysOld = 30) {
    try {
      const result = await PushNotification.cleanupExpiredNotifications();
      logger.info(`Cleaned up ${result.deletedCount} old push notifications`, 'PUSH-SERVICE');
      return result;
    } catch (error) {
      logger.error(`Failed to cleanup old notifications: ${error.message}`, 'PUSH-SERVICE');
      throw error;
    }
  }

  /**
   * Validate FCM message format
   */
  validateFCMMessage(message) {
    if (!message.notification && !message.data) {
      throw new Error('FCM message must contain either notification or data payload');
    }

    if (message.notification) {
      if (!message.notification.title || !message.notification.body) {
        throw new Error('FCM notification must contain title and body');
      }
    }

    if (!message.token && !message.tokens && !message.topic && !message.condition) {
      throw new Error('FCM message must specify target (token, tokens, topic, or condition)');
    }

    return true;
  }

  /**
   * Format multicast response for logging
   */
  formatMulticastResponse(response) {
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses.map((resp, idx) => ({
        index: idx,
        success: resp.success,
        messageId: resp.messageId,
        error: resp.error ? {
          code: resp.error.code,
          message: resp.error.message
        } : null
      }))
    };
  }

  async shutdown() {
    try {
      logger.info('Push notification service shutdown complete', 'PUSH-SERVICE');
    } catch (error) {
      logger.error(`Error during push notification service shutdown: ${error.message}`, 'PUSH-SERVICE');
    }
  }
}

module.exports = new PushNotificationService();