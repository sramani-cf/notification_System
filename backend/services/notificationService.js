const queueManager = require('../queues');
const EmailNotification = require('../models/emailNotification.model');
const InAppNotification = require('../models/inAppNotification.model');
const { NOTIFICATION_TYPES } = require('../constants');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.isInitialized = false;
    this.emailServiceReady = false;
  }

  async initialize() {
    try {
      logger.info('Starting notification service initialization...', 'NOTIFICATION-SERVICE');
      
      // Step 1: Initialize queue manager (requires Redis)
      logger.info('Initializing queue manager...', 'NOTIFICATION-SERVICE');
      const queueInitialized = await queueManager.initialize();
      if (!queueInitialized) {
        throw new Error('Queue manager initialization failed');
      }
      logger.success('Queue manager initialized successfully', 'NOTIFICATION-SERVICE');

      // Step 2: Test email service connection
      logger.info('Testing email service connection...', 'NOTIFICATION-SERVICE');
      const emailService = require('./emailService');
      this.emailServiceReady = await emailService.initialize();
      if (!this.emailServiceReady) {
        logger.warn('Email service initialization failed - emails will not be sent', 'NOTIFICATION-SERVICE');
        // Don't fail the entire service, but mark email as unavailable
      } else {
        logger.success('Email service initialized successfully', 'NOTIFICATION-SERVICE');
      }

      this.isInitialized = true;
      logger.success('Notification service initialized successfully', 'NOTIFICATION-SERVICE');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize notification service: ${error.message}`, 'NOTIFICATION-SERVICE');
      this.isInitialized = false;
      this.emailServiceReady = false;
      throw error; // Re-throw to prevent server startup with broken notification system
    }
  }

  /**
   * Check if the notification service is ready to process requests
   */
  isReady() {
    return this.isInitialized && queueManager.isInitialized;
  }

  /**
   * Check if email sending is available
   */
  isEmailReady() {
    return this.isReady() && this.emailServiceReady;
  }

  /**
   * Main fanout method - distributes notifications to appropriate channels
   * Handles both email and in-app notifications for signup, login, and password reset
   */
  async sendNotification(type, data, options = {}) {
    // Check if service is ready
    if (!this.isReady()) {
      throw new Error('Notification service not ready - check Redis connection and queue initialization');
    }

    // Validate notification type
    if (!this.isValidNotificationType(type)) {
      throw new Error(`Invalid notification type: ${type}`);
    }

    const results = {
      email: null,
      inapp: null
    };

    // Send email notification if enabled for this type
    if (this.shouldSendEmail(type)) {
      try {
        if (!this.isEmailReady()) {
          logger.error('Email service not available - check SMTP configuration', 'NOTIFICATION-SERVICE');
          results.email = {
            success: false,
            reason: 'Email service not available - check SMTP configuration and credentials'
          };
        } else {
          results.email = await this.sendEmailNotification(type, data, options);
        }
      } catch (error) {
        logger.error(`Email notification failed: ${error.message}`, 'NOTIFICATION-SERVICE');
        results.email = {
          success: false,
          reason: error.message
        };
      }
    } else {
      logger.info(`Email notifications not configured for type: ${type}`, 'NOTIFICATION-SERVICE');
      results.email = {
        success: false,
        reason: 'Email notifications not enabled for this type'
      };
    }

    // Send in-app notification if enabled for this type
    if (this.shouldSendInApp(type)) {
      try {
        results.inapp = await this.sendInAppNotification(type, data, options);
      } catch (error) {
        logger.error(`In-app notification failed: ${error.message}`, 'NOTIFICATION-SERVICE');
        results.inapp = {
          success: false,
          reason: error.message
        };
      }
    } else {
      logger.info(`In-app notifications not configured for type: ${type}`, 'NOTIFICATION-SERVICE');
      results.inapp = {
        success: false,
        reason: 'In-app notifications not enabled for this type'
      };
    }

    // Return combined results
    const emailSuccess = results.email?.success || false;
    const inappSuccess = results.inapp?.success || false;

    return {
      success: emailSuccess || inappSuccess, // At least one succeeded
      email: results.email,
      inapp: results.inapp,
      type: type,
      recipient: data.email || data.userId,
      timestamp: new Date().toISOString()
    };
  }

  isValidNotificationType(type) {
    const validTypes = [
      NOTIFICATION_TYPES.SIGNUP,
      NOTIFICATION_TYPES.LOGIN, 
      NOTIFICATION_TYPES.RESET_PASSWORD,
      NOTIFICATION_TYPES.PURCHASE,
      NOTIFICATION_TYPES.FRIEND_REQUEST
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

  shouldSendInApp(type) {
    // Send in-app notifications for these types
    const inAppEnabledTypes = [
      NOTIFICATION_TYPES.SIGNUP,
      NOTIFICATION_TYPES.LOGIN,
      NOTIFICATION_TYPES.RESET_PASSWORD,
      NOTIFICATION_TYPES.PURCHASE,
      NOTIFICATION_TYPES.FRIEND_REQUEST
    ];
    return inAppEnabledTypes.includes(type);
  }

  async sendEmailNotification(type, data, options = {}) {
    try {
      logger.info(`Initiating email notification for ${type}`, 'NOTIFICATION-SERVICE');

      // Validate required data
      this.validateEmailData(type, data);

      // Create email notification record upfront for tracking
      const notification = new EmailNotification({
        type: type,
        recipient: {
          email: data.email,
          userId: data.userId,
          username: data.username
        },
        subject: this.generateEmailSubject(type),
        content: {
          html: this.generateEmailHTML(type, data),
          text: this.stripHtml(this.generateEmailHTML(type, data))
        },
        status: 'pending',
        queueName: 'mail',
        metadata: {
          serverInfo: options.serverInfo,
          processedBy: `${options.serverInfo || 'NOTIFICATION-SERVICE'}-${Date.now()}`,
          originalData: new Map(Object.entries(data || {}))
        }
      });
      await notification.save();

      // Prepare email job data with the notification ID
      const emailJobData = this.prepareEmailJobData(type, data, options);
      emailJobData.notificationId = notification._id.toString();

      // Add to primary mail queue (fanout starts here)
      const job = await queueManager.addEmailJob('mail', emailJobData, {
        priority: this.getNotificationPriority(type),
        delay: options.delay || 0
      });

      // Update notification with job ID
      notification.jobId = job.id;
      await notification.save();

      logger.success(`Email notification queued successfully: ${job.id}`, 'NOTIFICATION-SERVICE');

      return {
        success: true,
        jobId: job.id,
        notificationId: notification._id.toString(),
        type: type,
        recipient: data.email,
        queueName: 'mail'
      };
    } catch (error) {
      logger.error(`Failed to send email notification: ${error.message}`, 'NOTIFICATION-SERVICE');
      throw error;
    }
  }

  async sendInAppNotification(type, data, options = {}) {
    try {
      logger.info(`Initiating in-app notification for ${type}`, 'NOTIFICATION-SERVICE');

      // Validate required data
      this.validateInAppData(type, data);

      // Generate notification content
      const notificationContent = this.generateInAppNotificationContent(type, data);

      // Create in-app notification record upfront for tracking
      const notification = new InAppNotification({
        type: type,
        recipient: {
          userId: data.userId,
          username: data.username,
          email: data.email
        },
        title: notificationContent.title,
        message: notificationContent.message,
        data: new Map(Object.entries(data || {})),
        priority: this.getNotificationPriority(type) >= 5 ? 'high' : 'normal',
        status: 'pending',
        queueName: 'inapp',
        metadata: {
          serverInfo: options.serverInfo,
          processedBy: `${options.serverInfo || 'NOTIFICATION-SERVICE'}-${Date.now()}`,
          originalData: new Map(Object.entries(data || {}))
        }
      });
      await notification.save();

      // Prepare in-app job data with the notification ID
      const jobData = this.prepareInAppJobData(type, data, options, notificationContent);
      jobData.notificationId = notification._id.toString();

      // Add to primary in-app queue (fanout continues here)
      const job = await queueManager.addInAppJob('inapp', jobData, {
        priority: this.getNotificationPriority(type),
        delay: options.delay || 0
      });

      // Update notification with job ID
      notification.jobId = job.id;
      notification.status = 'queued';
      await notification.save();

      logger.success(`In-app notification queued successfully: ${job.id}`, 'NOTIFICATION-SERVICE');

      return {
        success: true,
        jobId: job.id,
        notificationId: notification._id.toString(),
        type: type,
        recipient: data.userId,
        queueName: 'inapp'
      };
    } catch (error) {
      logger.error(`Failed to send in-app notification: ${error.message}`, 'NOTIFICATION-SERVICE');
      throw error;
    }
  }

  validateInAppData(type, data) {
    // Common validation
    if (!data.userId) {
      throw new Error('User ID is required for in-app notifications');
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
        break;
      case NOTIFICATION_TYPES.PURCHASE:
        if (!data.totalAmount) {
          throw new Error('Total amount is required for purchase notifications');
        }
        break;
      case NOTIFICATION_TYPES.FRIEND_REQUEST:
        if (!data.fromUsername) {
          throw new Error('From username is required for friend request notifications');
        }
        break;
    }
  }

  prepareInAppJobData(type, data, options, content) {
    const jobData = {
      type: type,
      recipient: {
        userId: data.userId,
        username: data.username || null,
        email: data.email || null
      },
      title: content.title,
      message: content.message,
      data: data,
      priority: this.getNotificationPriority(type) >= 5 ? 'high' : 'normal',
      originalData: { 
        ...data,
        // Add IDs for different notification types to enable callback tracking
        resetPasswordId: data.resetPasswordId || options.resetPasswordId || null,
        loginId: data.loginId || options.loginId || null,
        signupId: data.signupId || options.signupId || null,
        purchaseId: data.purchaseId || options.purchaseId || null,
        friendRequestId: data.friendRequestId || options.friendRequestId || null
      },
      serverInfo: options.serverInfo || 'NOTIFICATION-SERVICE',
      processedBy: `${options.serverInfo || 'NOTIFICATION-SERVICE'}-${Date.now()}`,
      createdAt: new Date().toISOString()
    };

    return jobData;
  }

  generateInAppNotificationContent(type, data) {
    const templates = {
      [NOTIFICATION_TYPES.LOGIN]: {
        title: 'New Login Alert',
        message: `New login detected from ${data.ipAddress || 'unknown location'} at ${new Date(data.loginTime || Date.now()).toLocaleString()}`
      },
      [NOTIFICATION_TYPES.SIGNUP]: {
        title: 'Welcome to Notification System!',
        message: `Welcome ${data.username}! Your account has been successfully created.`
      },
      [NOTIFICATION_TYPES.RESET_PASSWORD]: {
        title: 'Password Reset Request',
        message: data.resetToken 
          ? `A password reset was requested for your account. Use the code: ${data.resetToken}`
          : 'A password reset link has been sent to your email.'
      },
      [NOTIFICATION_TYPES.PURCHASE]: {
        title: 'Purchase Confirmation',
        message: `Your purchase of ${data.totalAmount} ${data.currency} has been processed successfully.`
      },
      [NOTIFICATION_TYPES.FRIEND_REQUEST]: {
        title: 'New Friend Request',
        message: `${data.fromUsername} sent you a friend request: "${data.message}"`
      }
    };

    return templates[type] || {
      title: 'Notification',
      message: 'You have a new notification'
    };
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
        // Add IDs for different email types to enable callback tracking
        // Check both data and options for tracking IDs (data takes precedence)
        resetPasswordId: data.resetPasswordId || options.resetPasswordId || null,
        loginId: data.loginId || options.loginId || null,
        signupId: data.signupId || options.signupId || null
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

  /**
   * Generate HTML content for email based on type
   */
  generateEmailHTML(type, data) {
    switch (type) {
      case 'signup':
        return this.generateSignupHTML(data);
      case 'login':
        return this.generateLoginHTML(data);
      case 'reset_password':
        return this.generatePasswordResetHTML(data);
      default:
        return '<p>Notification email</p>';
    }
  }

  /**
   * Strip HTML tags from content
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  generateSignupHTML(userData) {
    const { email, username, firstName, lastName } = userData;
    const displayName = firstName && lastName ? `${firstName} ${lastName}` : username;
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
            .header { text-align: center; color: #333; margin-bottom: 30px; }
            .content { color: #555; line-height: 1.6; }
            .highlight { color: #007bff; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Notification System!</h1>
            </div>
            <div class="content">
              <p>Hello <span class="highlight">${displayName}</span>,</p>
              <p>Thank you for signing up for our Notification System! Your account has been successfully created.</p>
              <p><strong>Account Details:</strong></p>
              <ul>
                <li>Username: ${username}</li>
                <li>Email: ${email}</li>
                <li>Registration Date: ${new Date().toLocaleDateString()}</li>
              </ul>
              <p>You can now start using all the features of our platform.</p>
              <p>If you have any questions, feel free to contact our support team.</p>
            </div>
            <div class="footer">
              <p>This email was sent from the Notification System.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  generateLoginHTML(userData) {
    const { email, username, loginTime, ipAddress, userAgent } = userData;
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
            .header { text-align: center; color: #333; margin-bottom: 30px; }
            .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
            .content { color: #555; line-height: 1.6; }
            .highlight { color: #007bff; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Login Alert</h1>
            </div>
            <div class="alert">
              <strong>Security Notice:</strong> A new login was detected on your account.
            </div>
            <div class="content">
              <p>Hello <span class="highlight">${username}</span>,</p>
              <p>We detected a new login to your Notification System account:</p>
              <p><strong>Login Details:</strong></p>
              <ul>
                <li>Time: ${loginTime ? new Date(loginTime).toLocaleString() : new Date().toLocaleString()}</li>
                <li>IP Address: ${ipAddress || 'Unknown'}</li>
                <li>Device: ${userAgent || 'Unknown'}</li>
              </ul>
              <p>If this was you, no action is needed. If you don't recognize this login, please contact our support team immediately.</p>
            </div>
            <div class="footer">
              <p>This email was sent from the Notification System for security purposes.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  generatePasswordResetHTML(userData) {
    const { email, username, resetToken, resetUrl } = userData;
    
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
            .header { text-align: center; color: #333; margin-bottom: 30px; }
            .content { color: #555; line-height: 1.6; }
            .highlight { color: #007bff; font-weight: bold; }
            .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .warning { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 20px 0; color: #721c24; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔑 Password Reset</h1>
            </div>
            <div class="content">
              <p>Hello <span class="highlight">${username}</span>,</p>
              <p>We received a request to reset the password for your Notification System account.</p>
              ${resetUrl ? `
                <p>Click the button below to reset your password:</p>
                <div style="text-align: center;">
                  <a href="${resetUrl}" class="button">Reset Password</a>
                </div>
                <p>Or copy and paste this link in your browser:</p>
                <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 4px;">${resetUrl}</p>
              ` : resetToken ? `
                <p>Use the following 6-digit reset code:</p>
                <div style="text-align: center; margin: 20px 0;">
                  <div style="display: inline-block; background: #f8f9fa; border: 2px dashed #007bff; padding: 20px 30px; border-radius: 8px;">
                    <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #007bff;">${resetToken}</span>
                  </div>
                </div>
                <p style="text-align: center; color: #666; font-size: 14px;">Enter this code on the password reset page</p>
              ` : ''}
              <div class="warning">
                <strong>Security Note:</strong> This reset ${resetUrl ? 'link' : 'code'} will expire in 1 hour. If you didn't request this password reset, please ignore this email.
              </div>
              <p>If you continue to have problems, please contact our support team.</p>
            </div>
            <div class="footer">
              <p>This email was sent from the Notification System.</p>
            </div>
          </div>
        </body>
      </html>
    `;
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