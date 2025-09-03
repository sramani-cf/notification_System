const { Worker } = require('bullmq');
const emailService = require('../services/emailService');
const EmailNotification = require('../models/emailNotification.model');
const Signup = require('../models/signups.model');
const Login = require('../models/logins.model');
const ResetPassword = require('../models/resetPasswords.model');
const queueManager = require('../queues');
const config = require('../config');
const logger = require('../utils/logger');

class MailWorker {
  constructor() {
    this.workers = {};
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Use shared connection from queue manager to reduce Redis connections
      if (!queueManager.isInitialized || !queueManager.redis) {
        throw new Error('Queue manager must be initialized before mail workers');
      }
      
      // Use the existing Redis connection from queue manager
      const connection = queueManager.redis;

      // Initialize email service
      await emailService.initialize();

      // Only initialize main mail queue worker to reduce Redis connections
      // All retry logic will be handled within the main worker
      this.workers.mail = new Worker(
        config.queues.mail.name,
        async (job) => this.processEmailJob(job, 'mail'),
        {
          connection,
          concurrency: 2, // Reduced concurrency
          limiter: {
            max: 5,
            duration: 1000 // 5 emails per second max to reduce load
          }
        }
      );

      // Set up event listeners for all workers
      this.setupWorkerEvents();

      this.isInitialized = true;
      logger.success('Mail workers initialized successfully', 'MAIL-WORKER');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize mail workers: ${error.message}`, 'MAIL-WORKER');
      return false;
    }
  }

  async processEmailJob(job, queueName) {
    const jobData = job.data;
    logger.info(`Processing ${jobData.type} email job ${job.id} from ${queueName} queue`, 'MAIL-WORKER');

    let notification = null;

    try {
      // Find notification record (should exist since notification service creates it upfront)
      if (jobData.notificationId) {
        notification = await EmailNotification.findById(jobData.notificationId);
      }

      if (!notification) {
        // Fallback: Create new notification record if somehow it doesn't exist
        let htmlContent = '';
        switch (jobData.type) {
          case 'signup':
            htmlContent = this.generateSignupHTML(jobData.originalData);
            break;
          case 'login':
            htmlContent = this.generateLoginHTML(jobData.originalData);
            break;
          case 'reset_password':
            htmlContent = this.generatePasswordResetHTML(jobData.originalData);
            break;
          default:
            htmlContent = '<p>Notification email</p>';
        }

        notification = new EmailNotification({
          type: jobData.type,
          recipient: {
            email: jobData.recipient.email,
            userId: jobData.recipient.userId,
            username: jobData.recipient.username
          },
          subject: jobData.subject,
          content: {
            html: htmlContent,
            text: this.stripHtml(htmlContent)
          },
          status: 'processing',
          queueName: queueName,
          jobId: job.id,
          metadata: {
            serverInfo: jobData.serverInfo,
            processedBy: jobData.processedBy,
            originalData: new Map(Object.entries(jobData.originalData || {}))
          }
        });
        await notification.save();
        jobData.notificationId = notification._id;
      } else {
        // Update existing notification status and queue info
        notification.status = 'processing';
        notification.queueName = queueName;
        notification.jobId = job.id;
        await notification.save();
      }

      // Update notification status
      await notification.incrementAttempt(queueName);

      // Update signup record if this is a welcome email
      let signup = null;
      if (jobData.type === 'signup' && jobData.originalData.signupId) {
        signup = await Signup.findById(jobData.originalData.signupId);
        if (signup) {
          await signup.markWelcomeEmailSending(queueName);
        }
      }

      // Update reset password record if this is a reset password email
      let resetPassword = null;
      if (jobData.type === 'reset_password' && jobData.originalData.resetPasswordId) {
        resetPassword = await ResetPassword.findById(jobData.originalData.resetPasswordId);
        if (resetPassword) {
          // Mark that email sending is in progress
          resetPassword.emailNotification = resetPassword.emailNotification || {};
          resetPassword.emailNotification.lastEmailAttemptAt = new Date();
          await resetPassword.save();
        }
      }

      // Update login record if this is a login alert email
      let login = null;
      if (jobData.type === 'login' && jobData.originalData.loginId) {
        login = await Login.findById(jobData.originalData.loginId);
        if (login) {
          await login.markLoginAlertEmailSending(queueName);
        }
      }

      // Send email using the HTML content we have
      let result;
      result = await emailService.sendEmail({
        to: jobData.recipient.email,
        subject: jobData.subject,
        html: notification.content.html,
        text: notification.content.text
      });

      // Mark as delivered
      await notification.markAsDelivered();
      
      // Update signup record on successful delivery
      if (signup) {
        await signup.markWelcomeEmailDelivered(result.messageId, result.response);
      }
      
      // Update reset password record on successful delivery
      if (resetPassword) {
        await resetPassword.markEmailDelivered();
        logger.info(`Reset password email delivered successfully for ${resetPassword.email}`, 'MAIL-WORKER');
      }
      
      // Update login record on successful delivery
      if (login) {
        await login.markLoginAlertEmailDelivered(result.messageId, result.response);
        logger.info(`Login alert email delivered successfully for ${login.email}`, 'MAIL-WORKER');
      }
      
      logger.success(`Email delivered successfully: ${job.id}`, 'MAIL-WORKER');

      return {
        success: true,
        messageId: result.messageId,
        notificationId: notification._id
      };

    } catch (error) {
      logger.error(`Failed to process email job ${job.id}: ${error.message}`, 'MAIL-WORKER');

      if (notification) {
        // Update signup record on failure if this is a welcome email
        if (jobData.type === 'signup' && jobData.originalData.signupId) {
          try {
            const signup = await Signup.findById(jobData.originalData.signupId);
            if (signup) {
              await signup.markWelcomeEmailFailed(error.message, queueName);
            }
          } catch (signupError) {
            logger.error(`Failed to update signup email status: ${signupError.message}`, 'MAIL-WORKER');
          }
        }
        
        // Update reset password record on failure if this is a reset password email
        if (jobData.type === 'reset_password' && jobData.originalData.resetPasswordId) {
          try {
            const resetPassword = await ResetPassword.findById(jobData.originalData.resetPasswordId);
            if (resetPassword) {
              await resetPassword.markEmailFailed(error.message);
              logger.warn(`Reset password email failed for ${resetPassword.email}: ${error.message}`, 'MAIL-WORKER');
            }
          } catch (resetError) {
            logger.error(`Failed to update reset password email status: ${resetError.message}`, 'MAIL-WORKER');
          }
        }
        
        // Update login record on failure if this is a login alert email
        if (jobData.type === 'login' && jobData.originalData.loginId) {
          try {
            const login = await Login.findById(jobData.originalData.loginId);
            if (login) {
              await login.markLoginAlertEmailFailed(error.message, queueName);
              logger.warn(`Login alert email failed for ${login.email}: ${error.message}`, 'MAIL-WORKER');
            }
          } catch (loginError) {
            logger.error(`Failed to update login alert email status: ${loginError.message}`, 'MAIL-WORKER');
          }
        }
        
        // Handle escalation based on attempt count and current queue
        await this.handleFailedJob(job, notification, error, queueName);
      }

      throw error;
    }
  }

  async handleFailedJob(job, notification, error, currentQueue) {
    const maxAttempts = config.notification.maxAttempts;
    const currentAttempts = notification.attempts;

    logger.info(`Handling failed job ${job.id}. Attempt ${currentAttempts}/${maxAttempts}`, 'MAIL-WORKER');

    try {
      if (currentAttempts >= maxAttempts) {
        // Escalate to next queue or DLQ
        await this.escalateJob(job, notification, currentQueue);
      } else {
        // Job will be retried by BullMQ's built-in retry mechanism
        logger.info(`Job ${job.id} will be retried by BullMQ (attempt ${currentAttempts + 1})`, 'MAIL-WORKER');
      }
    } catch (escalationError) {
      logger.error(`Failed to handle job escalation: ${escalationError.message}`, 'MAIL-WORKER');
    }
  }

  async escalateJob(job, notification, currentQueue) {
    const jobData = job.data;
    
    try {
      let nextQueue;
      switch (currentQueue) {
        case 'mail':
          nextQueue = 'retry1';
          logger.info(`Escalating job ${job.id} to retry-1 queue (5 min delay)`, 'MAIL-WORKER');
          break;
        case 'retry-1':
          nextQueue = 'retry2';
          logger.info(`Escalating job ${job.id} to retry-2 queue (30 min delay)`, 'MAIL-WORKER');
          break;
        case 'retry-2':
          nextQueue = 'dlq';
          logger.warn(`Escalating job ${job.id} to dead letter queue`, 'MAIL-WORKER');
          break;
        default:
          nextQueue = 'dlq';
          logger.warn(`Unknown queue ${currentQueue}, sending job ${job.id} to DLQ`, 'MAIL-WORKER');
      }

      if (nextQueue === 'dlq') {
        // Mark as permanently failed
        await notification.markAsFailed(`Max retries exceeded. Last error: ${job.failedReason}`);
      } else {
        // Reset attempt count for the new queue
        notification.attempts = 0;
        notification.queueName = nextQueue;
        await notification.save();
      }

      // Add job to next queue
      await queueManager.addEmailJob(nextQueue, {
        ...jobData,
        notificationId: notification._id.toString()
      });

      logger.info(`Successfully escalated job ${job.id} to ${nextQueue} queue`, 'MAIL-WORKER');
    } catch (error) {
      logger.error(`Failed to escalate job ${job.id}: ${error.message}`, 'MAIL-WORKER');
      // As a fallback, mark as failed
      if (notification) {
        await notification.markAsFailed(`Escalation failed: ${error.message}`);
      }
    }
  }

  async processDLQJob(job) {
    const jobData = job.data;
    logger.warn(`Processing DLQ job ${job.id} for ${jobData.type} email`, 'MAIL-WORKER');

    try {
      // Find notification record
      let notification = null;
      if (jobData.notificationId) {
        notification = await EmailNotification.findById(jobData.notificationId);
      }

      if (notification) {
        // Mark as permanently failed if not already
        if (notification.status !== 'failed') {
          await notification.markAsFailed('Reached dead letter queue - permanent failure');
        }

        // Log for manual intervention
        logger.error(`Email permanently failed - manual intervention required: ${JSON.stringify({
          notificationId: notification._id,
          type: jobData.type,
          recipient: jobData.recipient.email,
          attempts: notification.attempts,
          failureReason: notification.failureReason
        })}`, 'MAIL-WORKER');
      }

      return {
        success: false,
        reason: 'Reached dead letter queue',
        requiresManualIntervention: true
      };
    } catch (error) {
      logger.error(`Failed to process DLQ job ${job.id}: ${error.message}`, 'MAIL-WORKER');
      throw error;
    }
  }

  setupWorkerEvents() {
    Object.entries(this.workers).forEach(([name, worker]) => {
      worker.on('completed', (job, result) => {
        logger.info(`${name} worker completed job ${job.id}`, 'MAIL-WORKER');
      });

      worker.on('failed', (job, err) => {
        logger.error(`${name} worker failed job ${job.id}: ${err.message}`, 'MAIL-WORKER');
      });

      worker.on('error', (err) => {
        logger.error(`${name} worker error: ${err.message}`, 'MAIL-WORKER');
      });

      worker.on('stalled', (jobId) => {
        logger.warn(`${name} worker job ${jobId} stalled`, 'MAIL-WORKER');
      });
    });
  }

  async getWorkerStats() {
    const stats = {};
    
    for (const [name, worker] of Object.entries(this.workers)) {
      stats[name] = {
        isRunning: !worker.closing,
        processed: worker.processed,
        failed: worker.failed
      };
    }

    return stats;
  }

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

  async closeWorkers() {
    try {
      for (const [name, worker] of Object.entries(this.workers)) {
        await worker.close();
        logger.info(`Closed ${name} worker`, 'MAIL-WORKER');
      }
      
      this.isInitialized = false;
      logger.info('All mail workers closed successfully', 'MAIL-WORKER');
    } catch (error) {
      logger.error(`Error closing mail workers: ${error.message}`, 'MAIL-WORKER');
    }
  }
}

module.exports = new MailWorker();