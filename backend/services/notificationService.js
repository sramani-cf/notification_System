const queueManager = require('../queues');
const EmailNotification = require('../models/emailNotification.model');
const { NOTIFICATION_TYPES } = require('../constants');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Initialize queue manager
      await queueManager.initialize();
      this.isInitialized = true;
      logger.success('Notification service initialized successfully', 'NOTIFICATION-SERVICE');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize notification service: ${error.message}`, 'NOTIFICATION-SERVICE');
      return false;
    }
  }

  /**
   * Main fanout method - distributes notifications to appropriate channels
   * Currently only handles email notifications for signup, login, and password reset
   */
  async sendNotification(type, data, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Notification service not initialized');
    }

    // Validate notification type
    if (!this.isValidNotificationType(type)) {
      throw new Error(`Invalid notification type: ${type}`);
    }

    // Only process email notifications for allowed types
    if (this.shouldSendEmail(type)) {
      return await this.sendEmailNotification(type, data, options);
    } else {
      logger.warn(`Email notifications not configured for type: ${type}`, 'NOTIFICATION-SERVICE');
      return {
        success: false,
        reason: 'Email notifications not enabled for this type'
      };
    }
  }

  isValidNotificationType(type) {
    const validTypes = [
      NOTIFICATION_TYPES.SIGNUP,
      NOTIFICATION_TYPES.LOGIN, 
      NOTIFICATION_TYPES.RESET_PASSWORD
    ];
    return validTypes.includes(type);
  }

  shouldSendEmail(type) {
    // Only send emails for these specific types
    const emailEnabledTypes = [
      NOTIFICATION_TYPES.SIGNUP,
      NOTIFICATION_TYPES.LOGIN,
      NOTIFICATION_TYPES.RESET_PASSWORD
    ];
    return emailEnabledTypes.includes(type);
  }

  async sendEmailNotification(type, data, options = {}) {
    try {
      logger.info(`Initiating email notification for ${type}`, 'NOTIFICATION-SERVICE');

      // Validate required data
      this.validateEmailData(type, data);

      // Prepare email job data
      const emailJobData = this.prepareEmailJobData(type, data, options);

      // Add to primary mail queue (fanout starts here)
      const job = await queueManager.addEmailJob('mail', emailJobData, {
        priority: this.getNotificationPriority(type),
        delay: options.delay || 0
      });

      logger.success(`Email notification queued successfully: ${job.id}`, 'NOTIFICATION-SERVICE');

      return {
        success: true,
        jobId: job.id,
        type: type,
        recipient: data.email,
        queueName: 'mail'
      };
    } catch (error) {
      logger.error(`Failed to send email notification: ${error.message}`, 'NOTIFICATION-SERVICE');
      throw error;
    }
  }

  validateEmailData(type, data) {
    // Common validation
    if (!data.email) {
      throw new Error('Email address is required');
    }

    if (!this.isValidEmail(data.email)) {
      throw new Error('Invalid email address format');
    }

    // Type-specific validation
    switch (type) {
      case NOTIFICATION_TYPES.SIGNUP:
        if (!data.username) {
          throw new Error('Username is required for signup notifications');
        }
        break;
      case NOTIFICATION_TYPES.LOGIN:
        if (!data.username) {
          throw new Error('Username is required for login notifications');
        }
        break;
      case NOTIFICATION_TYPES.RESET_PASSWORD:
        if (!data.username && !data.email) {
          throw new Error('Username or email is required for password reset notifications');
        }
        if (!data.resetToken && !data.resetUrl) {
          throw new Error('Reset token or reset URL is required for password reset notifications');
        }
        break;
    }
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  prepareEmailJobData(type, data, options) {
    const jobData = {
      type: type,
      recipient: {
        email: data.email,
        userId: data.userId || null,
        username: data.username || null
      },
      subject: this.generateEmailSubject(type),
      originalData: { 
        ...data,
        // Add resetPasswordId for reset password emails to enable callback tracking
        resetPasswordId: options.resetPasswordId || null
      },
      serverInfo: options.serverInfo || 'NOTIFICATION-SERVICE',
      processedBy: `${options.serverInfo || 'NOTIFICATION-SERVICE'}-${Date.now()}`,
      createdAt: new Date().toISOString()
    };

    return jobData;
  }

  generateEmailSubject(type) {
    const subjects = {
      [NOTIFICATION_TYPES.SIGNUP]: 'Welcome to Notification System!',
      [NOTIFICATION_TYPES.LOGIN]: 'New Login Alert - Notification System',
      [NOTIFICATION_TYPES.RESET_PASSWORD]: 'Password Reset Request - Notification System'
    };

    return subjects[type] || `Notification System - ${type}`;
  }

  getNotificationPriority(type) {
    const priorities = {
      [NOTIFICATION_TYPES.RESET_PASSWORD]: 10, // Highest priority
      [NOTIFICATION_TYPES.SIGNUP]: 5,          // Medium priority
      [NOTIFICATION_TYPES.LOGIN]: 1            // Lower priority
    };

    return priorities[type] || 1;
  }

  /**
   * Batch send notifications - useful for bulk operations
   */
  async sendBatchNotifications(notifications) {
    if (!this.isInitialized) {
      throw new Error('Notification service not initialized');
    }

    logger.info(`Processing batch of ${notifications.length} notifications`, 'NOTIFICATION-SERVICE');

    const results = [];
    const errors = [];

    for (const notification of notifications) {
      try {
        const result = await this.sendNotification(
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
        logger.error(`Failed to process batch notification: ${error.message}`, 'NOTIFICATION-SERVICE');
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
   * Get notification statistics
   */
  async getNotificationStats() {
    try {
      const [emailStats, queueStats] = await Promise.all([
        EmailNotification.getStatistics(),
        queueManager.getQueueStats()
      ]);

      return {
        email: emailStats,
        queues: queueStats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get notification stats: ${error.message}`, 'NOTIFICATION-SERVICE');
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Retry failed notifications
   */
  async retryFailedNotifications(maxRetries = 10) {
    try {
      const failedNotifications = await EmailNotification.find({
        status: 'failed',
        attempts: { $lt: 4 }
      }).limit(maxRetries);

      let retriedCount = 0;

      for (const notification of failedNotifications) {
        try {
          // Reset notification for retry
          notification.status = 'pending';
          notification.attempts = 0;
          notification.lastAttemptAt = null;
          notification.failureReason = null;
          await notification.save();

          // Re-queue the notification
          const jobData = {
            type: notification.type,
            recipient: {
              email: notification.recipient.email,
              userId: notification.recipient.userId,
              username: notification.recipient.username
            },
            subject: notification.subject,
            originalData: notification.metadata.originalData ? 
              Object.fromEntries(notification.metadata.originalData) : {},
            notificationId: notification._id.toString(),
            serverInfo: 'RETRY-SERVICE',
            processedBy: `RETRY-SERVICE-${Date.now()}`
          };

          await queueManager.addEmailJob('mail', jobData);
          retriedCount++;

          logger.info(`Retried failed notification ${notification._id}`, 'NOTIFICATION-SERVICE');
        } catch (error) {
          logger.error(`Failed to retry notification ${notification._id}: ${error.message}`, 'NOTIFICATION-SERVICE');
        }
      }

      return { retriedCount, totalFailed: failedNotifications.length };
    } catch (error) {
      logger.error(`Failed to retry failed notifications: ${error.message}`, 'NOTIFICATION-SERVICE');
      throw error;
    }
  }

  /**
   * Clean up old notifications
   */
  async cleanupOldNotifications(daysOld = 30) {
    try {
      const result = await EmailNotification.cleanupOldNotifications(daysOld);
      logger.info(`Cleaned up ${result.deletedCount} old notifications`, 'NOTIFICATION-SERVICE');
      return result;
    } catch (error) {
      logger.error(`Failed to cleanup old notifications: ${error.message}`, 'NOTIFICATION-SERVICE');
      throw error;
    }
  }

  async shutdown() {
    try {
      await queueManager.closeConnections();
      this.isInitialized = false;
      logger.info('Notification service shutdown complete', 'NOTIFICATION-SERVICE');
    } catch (error) {
      logger.error(`Error during notification service shutdown: ${error.message}`, 'NOTIFICATION-SERVICE');
    }
  }
}

module.exports = new NotificationService();