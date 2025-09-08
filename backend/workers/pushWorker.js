const { Worker } = require('bullmq');
const admin = require('firebase-admin');
const config = require('../config');
const logger = require('../utils/logger');
const PushNotification = require('../models/pushNotification.model');
const FcmToken = require('../models/fcmToken.model');
const queueManager = require('../queues');

class PushWorker {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.firebaseApp = null;
    this.messaging = null;
  }

  async initialize() {
    try {
      logger.info('Initializing push notification worker...', 'PUSH-WORKER');
      
      // Initialize Firebase Admin SDK
      await this.initializeFirebase();
      
      // Create worker instance
      this.worker = new Worker(
        config.queues.push.name,
        this.processJob.bind(this),
        {
          connection: queueManager.redis,
          concurrency: config.queues.push.concurrency,
          autorun: true
        }
      );

      // Add event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      logger.success('Push notification worker initialized successfully', 'PUSH-WORKER');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize push worker: ${error.message}`, 'PUSH-WORKER');
      this.isInitialized = false;
      return false;
    }
  }

  async initializeFirebase() {
    try {
      // Check if Firebase is already initialized
      if (admin.apps.length > 0) {
        this.firebaseApp = admin.app();
      } else {
        // Initialize Firebase Admin SDK
        if (!config.firebase.projectId || !config.firebase.privateKey || !config.firebase.clientEmail) {
          throw new Error('Missing Firebase configuration. Please set FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL in environment variables.');
        }

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
      logger.success('Firebase Admin SDK initialized', 'PUSH-WORKER');
    } catch (error) {
      logger.error(`Failed to initialize Firebase: ${error.message}`, 'PUSH-WORKER');
      throw error;
    }
  }

  setupEventListeners() {
    this.worker.on('completed', (job, result) => {
      logger.info(`Push notification job ${job.id} completed successfully`, 'PUSH-WORKER');
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Push notification job ${job.id} failed: ${err.message}`, 'PUSH-WORKER');
    });

    this.worker.on('error', (err) => {
      logger.error(`Push worker error: ${err.message}`, 'PUSH-WORKER');
    });
  }

  async processJob(job) {
    const startTime = Date.now();
    const { data } = job;
    
    try {
      logger.info(`Processing push notification job ${job.id} for type: ${data.type}`, 'PUSH-WORKER');
      
      // Validate job data
      if (!data.notificationId) {
        throw new Error('Missing notification ID in job data');
      }

      // Fetch notification from database
      const notification = await PushNotification.findById(data.notificationId);
      if (!notification) {
        throw new Error(`Push notification ${data.notificationId} not found`);
      }

      // Update status to processing
      notification.status = 'processing';
      await notification.save();

      // If this is a purchase notification, update the purchase record
      if (notification.source && notification.source.referenceModel === 'Purchase' && notification.source.referenceId) {
        const Purchase = require('../models/purchases.model');
        const purchase = await Purchase.findById(notification.source.referenceId);
        if (purchase) {
          const tokenCount = await FcmToken.countDocuments({ 
            userId: notification.recipient.userId, 
            status: 'active' 
          });
          await purchase.markPurchasePushNotificationSending(tokenCount, job.queue.name);
          logger.info(`Updated purchase ${purchase._id} push notification status to sending`, 'PUSH-WORKER');
        }
      }

      // Get active FCM tokens for the user
      const tokens = await this.getUserTokens(notification.recipient.userId);
      if (!tokens || tokens.length === 0) {
        throw new Error(`No active FCM tokens found for user ${notification.recipient.userId}`);
      }

      // Update notification with token references
      await notification.updateFcmTokens(tokens.map(t => t._id));

      // Format FCM message
      const message = this.formatFCMMessage(notification, tokens);

      // Send push notification
      const response = await this.sendPushNotification(message, tokens);

      // Process response and update notification
      await this.processResponse(notification, response, tokens);

      // Update token statistics
      await this.updateTokenStats(tokens, response);

      const processingTime = Date.now() - startTime;
      logger.success(`Push notification ${notification._id} processed in ${processingTime}ms`, 'PUSH-WORKER');

      return {
        success: true,
        notificationId: notification._id,
        response: response,
        processingTime: processingTime
      };

    } catch (error) {
      logger.error(`Failed to process push notification job ${job.id}: ${error.message}`, 'PUSH-WORKER');
      
      // Update notification as failed if it exists
      if (data.notificationId) {
        try {
          const notification = await PushNotification.findById(data.notificationId);
          if (notification) {
            await notification.incrementAttempt(job.queue.name, error.message);
            
            // Update purchase record if this is a purchase notification
            if (notification.source && notification.source.referenceModel === 'Purchase' && notification.source.referenceId) {
              const Purchase = require('../models/purchases.model');
              const purchase = await Purchase.findById(notification.source.referenceId);
              if (purchase) {
                await purchase.markPurchasePushNotificationFailed(
                  error.message,
                  { 
                    successCount: 0, 
                    failureCount: 1,
                    errors: [error.message]
                  },
                  job.queue.name
                );
                logger.error(`Updated purchase ${purchase._id} push notification as failed: ${error.message}`, 'PUSH-WORKER');
              }
            }
            
            // Check if should retry or mark as failed
            if (notification.canRetry()) {
              await this.escalateToRetryQueue(notification, job.queue.name);
            } else {
              await notification.markAsFailed(error.message);
              await this.moveToDeadLetterQueue(notification);
            }
          }
        } catch (updateError) {
          logger.error(`Failed to update notification status: ${updateError.message}`, 'PUSH-WORKER');
        }
      }
      
      throw error;
    }
  }

  async getUserTokens(userId) {
    try {
      const tokens = await FcmToken.findActiveTokensForUser(userId);
      
      // Filter out stale tokens
      const activeTokens = [];
      for (const token of tokens) {
        if (token.checkStaleness()) {
          await token.markAsStale();
        } else {
          activeTokens.push(token);
        }
      }
      
      return activeTokens;
    } catch (error) {
      logger.error(`Failed to get user tokens: ${error.message}`, 'PUSH-WORKER');
      throw error;
    }
  }

  formatFCMMessage(notification, tokens) {
    const tokenStrings = tokens.map(t => t.token);
    
    // Base message structure
    const message = {
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: {
        notificationId: notification._id.toString(),
        type: notification.type,
        userId: notification.recipient.userId.toString(),
        timestamp: new Date().toISOString(),
        priority: notification.priority,
        ...this.convertMapToObject(notification.data)
      },
      android: {
        priority: notification.priority === 'urgent' ? 'high' : 'normal',
        notification: {
          clickAction: notification.clickAction || 'FLUTTER_NOTIFICATION_CLICK',
          channelId: `${notification.type}_channel`
        }
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body
            },
            sound: 'default',
            badge: 1,
            contentAvailable: true
          }
        }
      },
      webpush: {
        notification: {
          title: notification.title,
          body: notification.body,
          icon: notification.imageUrl || '/icon-192x192.png',
          badge: '/badge-72x72.png',
          tag: notification.type,
          requireInteraction: notification.priority === 'urgent',
          data: {
            notificationId: notification._id.toString(),
            clickAction: notification.clickAction
          }
        },
        fcmOptions: {
          link: notification.clickAction || '/'
        }
      }
    };

    // Add image if provided
    if (notification.imageUrl) {
      message.notification.image = notification.imageUrl;
      message.android.notification.image = notification.imageUrl;
      message.apns.payload.aps['mutable-content'] = 1;
      message.apns.fcmOptions = { image: notification.imageUrl };
    }

    // For multicast (multiple tokens)
    if (tokenStrings.length > 1) {
      message.tokens = tokenStrings;
    } else {
      message.token = tokenStrings[0];
    }

    return message;
  }

  convertMapToObject(map) {
    if (!map) return {};
    const obj = {};
    for (const [key, value] of map) {
      obj[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
    return obj;
  }

  async sendPushNotification(message, tokens) {
    try {
      let response;
      
      if (tokens.length === 1) {
        // Send to single device
        const messageId = await this.messaging.send(message);
        response = {
          success: 1,
          failure: 0,
          results: [{ messageId, success: true }]
        };
      } else {
        // Send to multiple devices (up to 500)
        const batchSize = 500;
        const batches = [];
        
        for (let i = 0; i < tokens.length; i += batchSize) {
          const batch = tokens.slice(i, i + batchSize);
          const batchMessage = { ...message, tokens: batch.map(t => t.token) };
          batches.push(this.messaging.sendEachForMulticast(batchMessage));
        }
        
        const results = await Promise.all(batches);
        
        // Combine results
        response = {
          success: 0,
          failure: 0,
          results: []
        };
        
        results.forEach(batchResult => {
          response.success += batchResult.successCount;
          response.failure += batchResult.failureCount;
          
          batchResult.responses.forEach((resp, idx) => {
            response.results.push({
              success: resp.success,
              messageId: resp.messageId,
              error: resp.error
            });
          });
        });
      }
      
      logger.info(`Push notification sent: ${response.success} success, ${response.failure} failure`, 'PUSH-WORKER');
      return response;
      
    } catch (error) {
      logger.error(`Failed to send push notification: ${error.message}`, 'PUSH-WORKER');
      throw error;
    }
  }

  async processResponse(notification, response, tokens) {
    try {
      const fcmResponse = {
        success: response.success,
        failure: response.failure,
        results: response.results
      };

      // Update purchase record if this is a purchase notification
      if (notification.source && notification.source.referenceModel === 'Purchase' && notification.source.referenceId) {
        const Purchase = require('../models/purchases.model');
        const purchase = await Purchase.findById(notification.source.referenceId);
        
        if (purchase) {
          const fcmResponseDetails = {
            successCount: response.success,
            failureCount: response.failure,
            messageIds: response.results
              .filter(r => r.messageId)
              .map(r => r.messageId),
            errors: response.results
              .filter(r => r.error)
              .map(r => r.error.message || r.error.code || 'Unknown error')
          };

          if (response.success > 0) {
            // At least some notifications were sent successfully
            if (response.success === tokens.length) {
              // All tokens succeeded - mark as delivered
              await purchase.markPurchasePushNotificationDelivered(
                response.results[0]?.messageId,
                fcmResponseDetails
              );
              logger.info(`Marked purchase ${purchase._id} push notification as delivered`, 'PUSH-WORKER');
            } else {
              // Partial success - still mark as delivered but note the failures
              await purchase.markPurchasePushNotificationDelivered(
                response.results.find(r => r.messageId)?.messageId,
                fcmResponseDetails
              );
              logger.info(`Marked purchase ${purchase._id} push notification as delivered (partial: ${response.success}/${tokens.length})`, 'PUSH-WORKER');
            }
          } else {
            // All tokens failed
            await purchase.markPurchasePushNotificationFailed(
              'All FCM tokens failed',
              fcmResponseDetails,
              'push'
            );
            logger.error(`Marked purchase ${purchase._id} push notification as failed`, 'PUSH-WORKER');
          }
        }
      }

      if (response.success > 0) {
        await notification.markAsSent(fcmResponse);
        
        // Mark as delivered for successfully sent notifications
        // In real implementation, you'd track actual delivery via FCM delivery receipts
        if (response.success === tokens.length) {
          await notification.markAsDelivered();
        }
      } else {
        await notification.markAsFailed('All tokens failed', fcmResponse);
      }

      // Handle failed tokens
      if (response.failure > 0) {
        await this.handleFailedTokens(response.results, tokens);
      }

    } catch (error) {
      logger.error(`Failed to process FCM response: ${error.message}`, 'PUSH-WORKER');
      throw error;
    }
  }

  async handleFailedTokens(results, tokens) {
    try {
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const token = tokens[i];
        
        if (!result.success && result.error) {
          const errorCode = result.error.code || result.error.errorCode;
          
          // Add error to token
          await token.addError(result.error.message, errorCode);
          
          // Handle specific error codes
          switch (errorCode) {
            case 'messaging/invalid-registration-token':
            case 'messaging/registration-token-not-registered':
              // Mark token as invalid
              await token.markAsStale();
              logger.warn(`Token ${token._id} marked as stale due to: ${errorCode}`, 'PUSH-WORKER');
              break;
              
            case 'messaging/message-rate-exceeded':
              // Token is valid but rate limited
              logger.warn(`Rate limit exceeded for token ${token._id}`, 'PUSH-WORKER');
              break;
              
            default:
              logger.error(`FCM error for token ${token._id}: ${errorCode}`, 'PUSH-WORKER');
          }
        }
      }
    } catch (error) {
      logger.error(`Failed to handle failed tokens: ${error.message}`, 'PUSH-WORKER');
    }
  }

  async updateTokenStats(tokens, response) {
    try {
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        const result = response.results[i];
        
        if (result.success) {
          await token.updateNotificationStats('sent');
          // In real implementation, you'd track delivery separately
          await token.updateNotificationStats('delivered');
        } else {
          await token.updateNotificationStats('failed');
        }
      }
    } catch (error) {
      logger.error(`Failed to update token stats: ${error.message}`, 'PUSH-WORKER');
    }
  }

  async escalateToRetryQueue(notification, currentQueue) {
    try {
      let nextQueue;
      
      if (currentQueue === config.queues.push.name) {
        nextQueue = 'pushRetry1';
      } else if (currentQueue === config.queues.pushRetry1.name) {
        nextQueue = 'pushRetry2';
      } else {
        nextQueue = 'pushDlq';
      }
      
      const jobData = {
        type: notification.type,
        notificationId: notification._id.toString(),
        userId: notification.recipient.userId,
        attempt: notification.attempts + 1,
        previousQueue: currentQueue
      };
      
      await queueManager.addPushRetryJob(nextQueue, jobData);
      
      logger.info(`Escalated push notification ${notification._id} to ${nextQueue}`, 'PUSH-WORKER');
    } catch (error) {
      logger.error(`Failed to escalate notification: ${error.message}`, 'PUSH-WORKER');
    }
  }

  async moveToDeadLetterQueue(notification) {
    try {
      const jobData = {
        type: notification.type,
        notificationId: notification._id.toString(),
        userId: notification.recipient.userId,
        failureReason: notification.failureReason,
        attempts: notification.attempts
      };
      
      await queueManager.addPushRetryJob('pushDlq', jobData);
      
      logger.warn(`Moved push notification ${notification._id} to DLQ`, 'PUSH-WORKER');
    } catch (error) {
      logger.error(`Failed to move notification to DLQ: ${error.message}`, 'PUSH-WORKER');
    }
  }

  async shutdown() {
    try {
      if (this.worker) {
        await this.worker.close();
        logger.info('Push notification worker shut down', 'PUSH-WORKER');
      }
    } catch (error) {
      logger.error(`Error during push worker shutdown: ${error.message}`, 'PUSH-WORKER');
    }
  }
}

module.exports = new PushWorker();