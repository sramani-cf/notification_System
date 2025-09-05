const { Worker } = require('bullmq');
const websocketService = require('../services/websocketService');
const InAppNotification = require('../models/inAppNotification.model');
const Login = require('../models/logins.model');
const FriendRequest = require('../models/friendRequests.model');
const queueManager = require('../queues');
const config = require('../config');
const logger = require('../utils/logger');
const telemetryService = require('../services/telemetryService');

class InAppWorker {
  constructor() {
    this.workers = {};
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Use shared connection from queue manager to reduce Redis connections
      if (!queueManager.isInitialized || !queueManager.redis) {
        throw new Error('Queue manager must be initialized before in-app workers');
      }
      
      // Use the existing Redis connection from queue manager
      const connection = queueManager.redis;

      // Initialize main in-app notification queue worker
      this.workers.inapp = new Worker(
        config.queues.inapp.name,
        async (job) => this.processInAppNotificationJob(job, 'inapp'),
        {
          connection,
          concurrency: config.queues.inapp.concurrency,
          limiter: {
            max: 20, // Higher limit for real-time notifications
            duration: 1000 // 20 notifications per second max
          }
        }
      );

      // Initialize in-app retry-1 queue worker
      this.workers.inappRetry1 = new Worker(
        config.queues.inappRetry1.name,
        async (job) => this.processInAppNotificationJob(job, 'inapp-retry-1'),
        {
          connection,
          concurrency: config.queues.inappRetry1.concurrency,
          limiter: {
            max: 10, // Lower limit for retry queue
            duration: 1000
          }
        }
      );

      // Initialize in-app retry-2 queue worker
      this.workers.inappRetry2 = new Worker(
        config.queues.inappRetry2.name,
        async (job) => this.processInAppNotificationJob(job, 'inapp-retry-2'),
        {
          connection,
          concurrency: config.queues.inappRetry2.concurrency,
          limiter: {
            max: 5, // Even lower limit for second retry queue
            duration: 1000
          }
        }
      );

      // Initialize in-app DLQ worker
      this.workers.inappDlq = new Worker(
        config.queues.inappDlq.name,
        async (job) => this.processDLQJob(job),
        {
          connection,
          concurrency: config.queues.inappDlq.concurrency,
          limiter: {
            max: 1, // Very low limit for DLQ processing
            duration: 5000
          }
        }
      );

      // Set up event listeners for all workers
      this.setupWorkerEvents();

      this.isInitialized = true;
      logger.success('In-app notification workers initialized successfully', 'INAPP-WORKER');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize in-app workers: ${error.message}`, 'INAPP-WORKER');
      return false;
    }
  }

  async processInAppNotificationJob(job, queueName) {
    const jobData = job.data;
    logger.info(`Processing ${jobData.type} in-app notification job ${job.id} from ${queueName} queue`, 'INAPP-WORKER');

    // Add telemetry stage for in-app worker processing start
    if (jobData.telemetryId) {
      telemetryService.addStage(jobData.telemetryId, {
        component: 'INAPP-WORKER',
        stage: 'worker:processing',
        status: 'processing',
        metadata: {
          jobId: job.id,
          queueName: queueName,
          workerType: 'inapp',
          notificationType: jobData.type,
          recipientUserId: jobData.recipient?.userId
        }
      });
    }

    let notification = null;

    try {
      // Find notification record (should exist since notification service creates it upfront)
      if (jobData.notificationId) {
        notification = await InAppNotification.findById(jobData.notificationId);
      }

      if (!notification) {
        // Fallback: Create new notification record if somehow it doesn't exist
        notification = new InAppNotification({
          type: jobData.type,
          recipient: {
            userId: jobData.recipient.userId,
            username: jobData.recipient.username,
            email: jobData.recipient.email
          },
          title: jobData.title,
          message: jobData.message,
          data: new Map(Object.entries(jobData.data || {})),
          priority: jobData.priority || 'normal',
          status: 'pending',
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
        notification.status = 'pending';
        notification.queueName = queueName;
        notification.jobId = job.id;
        await notification.save();
      }

      // Check if notification has expired
      if (notification.isExpired()) {
        await notification.markAsFailed('Notification expired');
        logger.warn(`Notification ${notification._id} expired, marking as failed`, 'INAPP-WORKER');
        return {
          success: false,
          reason: 'Notification expired'
        };
      }

      // Update notification attempt
      await notification.incrementAttempt(queueName);

      // Update login record if this is a login alert notification
      let login = null;
      if (jobData.type === 'login' && jobData.originalData.loginId) {
        login = await Login.findById(jobData.originalData.loginId);
        if (login) {
          await login.updateLoginInAppNotificationStatus('pending', { queueName });
          logger.info(`Updated login in-app notification status to 'pending' for ${login.username}`, 'INAPP-WORKER');
        } else {
          logger.error(`Login record not found for ID: ${jobData.originalData.loginId}`, 'INAPP-WORKER');
        }
      }

      // Update friend request record if this is a friend request notification
      let friendRequest = null;
      if (jobData.type === 'friend_request' && jobData.originalData?.friendRequestId) {
        friendRequest = await FriendRequest.findById(jobData.originalData.friendRequestId);
        if (friendRequest) {
          await friendRequest.updateFriendRequestInAppNotificationStatus('pending', { queueName });
          logger.info(`Updated friend request in-app notification status to 'pending' for request to ${friendRequest.toUsername}`, 'INAPP-WORKER');
        } else {
          logger.error(`Friend request record not found for ID: ${jobData.originalData.friendRequestId}`, 'INAPP-WORKER');
        }
      }

      // Add telemetry stage for WebSocket delivery attempt
      if (jobData.telemetryId) {
        telemetryService.addStage(jobData.telemetryId, {
          component: 'INAPP-WORKER',
          stage: 'websocket:sending',
          status: 'processing',
          metadata: {
            recipientUserId: notification.recipient.userId,
            notificationId: notification._id,
            title: notification.title,
            priority: notification.priority,
            attempt: notification.attempts
          }
        });
      }

      // Send notification via WebSocket
      const deliveryResult = await websocketService.sendNotificationToUser(
        notification.recipient.userId,
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          priority: notification.priority,
          createdAt: notification.createdAt
        }
      );

      if (deliveryResult.success) {
        // Add telemetry stage for successful WebSocket delivery
        if (jobData.telemetryId) {
          telemetryService.addStage(jobData.telemetryId, {
            component: 'INAPP-WORKER',
            stage: 'websocket:delivered',
            status: 'success',
            metadata: {
              socketId: deliveryResult.socketId,
              deliveryMethod: deliveryResult.deliveryMethod,
              deliveryTime: new Date().toISOString(),
              recipientUserId: notification.recipient.userId
            }
          });
        }
        
        // Mark as delivered
        await notification.markAsDelivered(
          deliveryResult.socketId,
          deliveryResult.deliveryMethod
        );
        
        // Update login record on successful delivery
        if (login) {
          await login.markLoginInAppNotificationDelivered(
            deliveryResult.socketId,
            deliveryResult.deliveryMethod
          );
          logger.success(`Login in-app notification delivered successfully for ${login.username} via ${deliveryResult.deliveryMethod}`, 'INAPP-WORKER');
        }
        
        // Update friend request record on successful delivery
        if (friendRequest) {
          await friendRequest.markFriendRequestInAppNotificationDelivered(
            deliveryResult.socketId,
            deliveryResult.deliveryMethod
          );
          logger.success(`Friend request in-app notification delivered successfully to ${friendRequest.toUsername} via ${deliveryResult.deliveryMethod}`, 'INAPP-WORKER');
        }
        
        logger.success(`In-app notification delivered successfully: ${job.id} to user ${notification.recipient.userId}`, 'INAPP-WORKER');

        return {
          success: true,
          deliveryMethod: deliveryResult.deliveryMethod,
          socketId: deliveryResult.socketId,
          notificationId: notification._id
        };
      } else {
        // Add telemetry stage for WebSocket delivery failure
        if (jobData.telemetryId) {
          telemetryService.addStage(jobData.telemetryId, {
            component: 'INAPP-WORKER',
            stage: 'websocket:failed',
            status: 'error',
            error: deliveryResult.reason || 'Failed to deliver notification',
            metadata: {
              reason: deliveryResult.reason,
              recipientUserId: notification.recipient.userId,
              attempt: notification.attempts
            }
          });
        }
        
        // Handle delivery failure
        throw new Error(deliveryResult.reason || 'Failed to deliver notification');
      }

    } catch (error) {
      logger.error(`Failed to process in-app notification job ${job.id}: ${error.message}`, 'INAPP-WORKER');

      // Add telemetry stage for job failure
      if (jobData.telemetryId) {
        telemetryService.addStage(jobData.telemetryId, {
          component: 'INAPP-WORKER',
          stage: 'job:failed',
          status: 'error',
          error: error.message,
          metadata: {
            jobId: job.id,
            attempt: notification?.attempts || 0,
            errorType: error.name || 'InAppNotificationError',
            queueName: queueName
          }
        });
      }

      if (notification) {
        // Update login record on failure if this is a login alert notification
        if (jobData.type === 'login' && jobData.originalData.loginId) {
          try {
            const login = await Login.findById(jobData.originalData.loginId);
            if (login) {
              await login.markLoginInAppNotificationFailed(error.message, queueName);
              logger.warn(`Login in-app notification failed for ${login.username}: ${error.message}`, 'INAPP-WORKER');
            }
          } catch (loginError) {
            logger.error(`Failed to update login in-app notification status: ${loginError.message}`, 'INAPP-WORKER');
          }
        }

        // Update friend request record on failure if this is a friend request notification
        if (jobData.type === 'friend_request' && jobData.originalData?.friendRequestId) {
          try {
            const friendRequest = await FriendRequest.findById(jobData.originalData.friendRequestId);
            if (friendRequest) {
              await friendRequest.markFriendRequestInAppNotificationFailed(error.message, queueName);
              logger.warn(`Friend request in-app notification failed for ${friendRequest.toUsername}: ${error.message}`, 'INAPP-WORKER');
            }
          } catch (friendRequestError) {
            logger.error(`Failed to update friend request in-app notification status: ${friendRequestError.message}`, 'INAPP-WORKER');
          }
        }
        
        // Handle escalation based on attempt count and current queue
        await this.handleFailedJob(job, notification, error, queueName);
      }

      throw error;
    }
  }

  async handleFailedJob(job, notification, error, currentQueue) {
    // Get max attempts based on current queue
    let maxAttempts;
    switch (currentQueue) {
      case 'inapp':
        maxAttempts = config.queues.inapp.attempts;
        break;
      case 'inapp-retry-1':
        maxAttempts = config.queues.inappRetry1.attempts;
        break;
      case 'inapp-retry-2':
        maxAttempts = config.queues.inappRetry2.attempts;
        break;
      default:
        maxAttempts = notification.maxAttempts;
    }

    const currentAttempts = notification.attempts;
    logger.info(`Handling failed in-app job ${job.id}. Attempt ${currentAttempts}/${maxAttempts} in ${currentQueue}`, 'INAPP-WORKER');

    try {
      if (currentAttempts >= maxAttempts) {
        // Escalate to next queue or DLQ
        await this.escalateJob(job, notification, currentQueue);
      } else {
        // Job will be retried by BullMQ's built-in retry mechanism
        logger.info(`In-app job ${job.id} will be retried by BullMQ (attempt ${currentAttempts + 1})`, 'INAPP-WORKER');
      }
    } catch (escalationError) {
      logger.error(`Failed to handle in-app job escalation: ${escalationError.message}`, 'INAPP-WORKER');
    }
  }

  async escalateJob(job, notification, currentQueue) {
    const jobData = job.data;
    
    try {
      let nextQueue;
      switch (currentQueue) {
        case 'inapp':
          nextQueue = 'inappRetry1';
          logger.info(`Escalating in-app job ${job.id} to retry-1 queue (2 min delay)`, 'INAPP-WORKER');
          break;
        case 'inapp-retry-1':
          nextQueue = 'inappRetry2';
          logger.info(`Escalating in-app job ${job.id} to retry-2 queue (10 min delay)`, 'INAPP-WORKER');
          break;
        case 'inapp-retry-2':
          nextQueue = 'inappDlq';
          logger.warn(`Escalating in-app job ${job.id} to dead letter queue`, 'INAPP-WORKER');
          break;
        default:
          nextQueue = 'inappDlq';
          logger.warn(`Unknown queue ${currentQueue}, sending in-app job ${job.id} to DLQ`, 'INAPP-WORKER');
      }

      if (nextQueue === 'inappDlq') {
        // Mark as permanently failed
        await notification.markAsFailed(`Max retries exceeded. Last error: ${job.failedReason}`);
        
        // Track escalation to DLQ
        await notification.trackEscalation(currentQueue, nextQueue, 'Max retries exceeded');
        
        logger.error(`In-app notification permanently failed - requires manual intervention: ${JSON.stringify({
          notificationId: notification._id,
          type: jobData.type,
          recipient: jobData.recipient.userId,
          attempts: notification.attempts,
          failureReason: notification.failureReason
        })}`, 'INAPP-WORKER');
      } else {
        // Track escalation
        await notification.trackEscalation(currentQueue, nextQueue, `Failed after ${notification.attempts} attempts`);
        
        // Reset attempt count for the new queue
        notification.attempts = 0;
        notification.queueName = nextQueue === 'inappRetry1' ? 'inapp-retry-1' : 
                                nextQueue === 'inappRetry2' ? 'inapp-retry-2' : 'inapp-dlq';
        await notification.save();
      }

      // Add job to next queue
      await queueManager.addInAppRetryJob(nextQueue, {
        ...jobData,
        notificationId: notification._id.toString()
      });

      logger.info(`Successfully escalated in-app job ${job.id} to ${nextQueue} queue`, 'INAPP-WORKER');
    } catch (error) {
      logger.error(`Failed to escalate in-app job ${job.id}: ${error.message}`, 'INAPP-WORKER');
      // As a fallback, mark as failed
      if (notification) {
        await notification.markAsFailed(`Escalation failed: ${error.message}`);
      }
    }
  }

  async processDLQJob(job) {
    const jobData = job.data;
    logger.warn(`Processing in-app DLQ job ${job.id} for ${jobData.type} notification`, 'INAPP-WORKER');

    try {
      // Find notification record
      let notification = null;
      if (jobData.notificationId) {
        notification = await InAppNotification.findById(jobData.notificationId);
      }

      if (notification) {
        // Mark as permanently failed if not already
        if (notification.status !== 'failed') {
          await notification.markAsFailed('Reached dead letter queue - permanent failure');
        }

        // Log for manual intervention
        logger.error(`In-app notification permanently failed - manual intervention required: ${JSON.stringify({
          notificationId: notification._id,
          type: jobData.type,
          recipient: jobData.recipient.userId,
          attempts: notification.attempts,
          failureReason: notification.failureReason,
          escalationHistory: notification.metadata?.escalationHistory || []
        })}`, 'INAPP-WORKER');
      }

      return {
        success: false,
        reason: 'Reached dead letter queue',
        requiresManualIntervention: true
      };
    } catch (error) {
      logger.error(`Failed to process in-app DLQ job ${job.id}: ${error.message}`, 'INAPP-WORKER');
      throw error;
    }
  }

  setupWorkerEvents() {
    Object.entries(this.workers).forEach(([name, worker]) => {
      worker.on('completed', (job, result) => {
        logger.info(`${name} in-app worker completed job ${job.id}`, 'INAPP-WORKER');
      });

      worker.on('failed', (job, err) => {
        logger.error(`${name} in-app worker failed job ${job.id}: ${err.message}`, 'INAPP-WORKER');
      });

      worker.on('error', (err) => {
        logger.error(`${name} in-app worker error: ${err.message}`, 'INAPP-WORKER');
      });

      worker.on('stalled', (jobId) => {
        logger.warn(`${name} in-app worker job ${jobId} stalled`, 'INAPP-WORKER');
      });
    });
  }

  async getWorkerStats() {
    const stats = {};
    
    for (const [name, worker] of Object.entries(this.workers)) {
      stats[name] = {
        isRunning: !worker.closing,
        processed: worker.processed || 0,
        failed: worker.failed || 0
      };
    }

    return stats;
  }

  generateNotificationContent(type, data) {
    const templates = {
      login: {
        title: 'New Login Alert',
        message: `New login detected from ${data.ipAddress || 'unknown location'} at ${new Date(data.loginTime || Date.now()).toLocaleString()}`,
      },
      signup: {
        title: 'Welcome to Notification System!',
        message: `Welcome ${data.username}! Your account has been successfully created.`,
      },
      reset_password: {
        title: 'Password Reset Request',
        message: `A password reset was requested for your account. Use the code: ${data.resetToken}`,
      },
      purchase: {
        title: 'Purchase Confirmation',
        message: `Your purchase of ${data.totalAmount} ${data.currency} has been processed successfully.`,
      },
      friend_request: {
        title: 'New Friend Request',
        message: `${data.fromUsername} sent you a friend request: "${data.message}"`,
      }
    };

    return templates[type] || {
      title: 'Notification',
      message: 'You have a new notification'
    };
  }

  async closeWorkers() {
    try {
      for (const [name, worker] of Object.entries(this.workers)) {
        await worker.close();
        logger.info(`Closed ${name} in-app worker`, 'INAPP-WORKER');
      }
      
      this.isInitialized = false;
      logger.info('All in-app workers closed successfully', 'INAPP-WORKER');
    } catch (error) {
      logger.error(`Error closing in-app workers: ${error.message}`, 'INAPP-WORKER');
    }
  }
}

module.exports = new InAppWorker();