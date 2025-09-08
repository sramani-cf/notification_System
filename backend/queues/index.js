const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');
const telemetryService = require('../services/telemetryService');

class QueueManager {
  constructor() {
    this.redis = null;
    this.queues = {};
    this.workers = {};
    this.isInitialized = false;
  }

  async initialize() {
    try {
      // Initialize Redis connection
      const redisConfig = {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        retryDelayOnFailover: config.redis.retryDelayOnFailover,
        connectTimeout: config.redis.connectTimeout,
        lazyConnect: config.redis.lazyConnect
      };

      // Add username if provided
      if (config.redis.username) {
        redisConfig.username = config.redis.username;
      }

      this.redis = new Redis(redisConfig);

      // Test Redis connection (lazyConnect handles this automatically)
      await this.redis.ping();
      logger.success('Redis connection established', 'QUEUE-MANAGER');

      // Initialize all queues
      await this.initializeQueues();
      
      this.isInitialized = true;
      logger.success('Queue manager initialized successfully', 'QUEUE-MANAGER');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize queue manager: ${error.message}`, 'QUEUE-MANAGER');
      this.isInitialized = false;
      return false;
    }
  }

  async initializeQueues() {
    // Reuse the existing Redis connection instead of creating new ones
    const connection = this.redis;

    // Primary mail queue - handles initial email processing
    this.queues.mail = new Queue(config.queues.mail.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: config.notification.maxAttempts,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 1000 // Base delay for exponential backoff
          }
        }
      }
    });

    // Add telemetry event listeners for mail queue
    this.addQueueTelemetry(this.queues.mail, 'mail');

    // Retry-1 queue - 5 minute delay for first escalation
    this.queues.retry1 = new Queue(config.queues.retry1.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        delay: config.queues.retry1.delay,
        attempts: config.notification.maxAttempts,
        backoff: {
          type: 'exponential', 
          settings: {
            delay: 2000
          }
        }
      }
    });
    this.addQueueTelemetry(this.queues.retry1, 'retry1');

    // Retry-2 queue - 30 minute delay for second escalation  
    this.queues.retry2 = new Queue(config.queues.retry2.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        delay: config.queues.retry2.delay,
        attempts: config.notification.maxAttempts,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 5000
          }
        }
      }
    });
    this.addQueueTelemetry(this.queues.retry2, 'retry2');

    // Dead Letter Queue - for permanently failed messages
    this.queues.dlq = new Queue(config.queues.dlq.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
        attempts: 1 // No retries in DLQ
      }
    });
    this.addQueueTelemetry(this.queues.dlq, 'dlq');

    // In-app notification queue - handles real-time notifications via WebSocket
    this.queues.inapp = new Queue(config.queues.inapp.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: config.queues.inapp.attempts,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 500 // Base delay for exponential backoff (faster for real-time)
          }
        }
      }
    });
    this.addQueueTelemetry(this.queues.inapp, 'inapp');

    // In-app retry-1 queue - 2 minute delay for first escalation
    this.queues.inappRetry1 = new Queue(config.queues.inappRetry1.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        delay: config.queues.inappRetry1.delay,
        attempts: config.queues.inappRetry1.attempts,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 1000
          }
        }
      }
    });
    this.addQueueTelemetry(this.queues.inappRetry1, 'inappRetry1');

    // In-app retry-2 queue - 10 minute delay for second escalation
    this.queues.inappRetry2 = new Queue(config.queues.inappRetry2.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        delay: config.queues.inappRetry2.delay,
        attempts: config.queues.inappRetry2.attempts,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 2000
          }
        }
      }
    });
    this.addQueueTelemetry(this.queues.inappRetry2, 'inappRetry2');

    // In-app Dead Letter Queue - for permanently failed in-app notifications
    this.queues.inappDlq = new Queue(config.queues.inappDlq.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
        attempts: 1 // No retries in DLQ
      }
    });
    this.addQueueTelemetry(this.queues.inappDlq, 'inappDlq');

    // Push notification queue - handles FCM push notifications
    this.queues.push = new Queue(config.queues.push?.name || 'push-notification-queue', {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: config.queues.push?.attempts || 3,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 1000 // Base delay for exponential backoff
          }
        }
      }
    });
    this.addQueueTelemetry(this.queues.push, 'push');

    // Push retry-1 queue - 5 minute delay for first escalation
    this.queues.pushRetry1 = new Queue(config.queues.pushRetry1?.name || 'push-retry-1-queue', {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        delay: config.queues.pushRetry1?.delay || 5 * 60 * 1000, // 5 minutes
        attempts: config.queues.pushRetry1?.attempts || 2,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 2000
          }
        }
      }
    });
    this.addQueueTelemetry(this.queues.pushRetry1, 'pushRetry1');

    // Push retry-2 queue - 30 minute delay for second escalation
    this.queues.pushRetry2 = new Queue(config.queues.pushRetry2?.name || 'push-retry-2-queue', {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        delay: config.queues.pushRetry2?.delay || 30 * 60 * 1000, // 30 minutes
        attempts: config.queues.pushRetry2?.attempts || 1,
        backoff: {
          type: 'exponential',
          settings: {
            delay: 5000
          }
        }
      }
    });
    this.addQueueTelemetry(this.queues.pushRetry2, 'pushRetry2');

    // Push Dead Letter Queue - for permanently failed push notifications
    this.queues.pushDlq = new Queue(config.queues.pushDlq?.name || 'push-dlq-queue', {
      connection,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
        attempts: 1 // No retries in DLQ
      }
    });
    this.addQueueTelemetry(this.queues.pushDlq, 'pushDlq');

    logger.info('All queues (including push notification queues) initialized successfully', 'QUEUE-MANAGER');
  }

  addQueueTelemetry(queue, queueName) {
    // Job added to queue
    queue.on('added', (job) => {
      telemetryService.addStage(job.data.telemetryId, {
        component: `QUEUE-${queueName.toUpperCase()}`,
        stage: 'job:added',
        status: 'processing',
        metadata: {
          jobId: job.id,
          priority: job.opts.priority,
          delay: job.opts.delay,
          attempts: job.opts.attempts
        }
      });
      
      telemetryService.updateComponentMetrics(`QUEUE-${queueName.toUpperCase()}`, {
        jobsAdded: telemetryService.getComponentMetrics(`QUEUE-${queueName.toUpperCase()}`)?.jobsAdded + 1 || 1
      });
    });

    // Job started processing
    queue.on('active', (job) => {
      telemetryService.addStage(job.data.telemetryId, {
        component: `QUEUE-${queueName.toUpperCase()}`,
        stage: 'job:processing',
        status: 'processing',
        metadata: {
          jobId: job.id,
          processedBy: job.processedBy,
          attemptsMade: job.attemptsMade
        }
      });
    });

    // Job completed successfully
    queue.on('completed', (job) => {
      telemetryService.addStage(job.data.telemetryId, {
        component: `QUEUE-${queueName.toUpperCase()}`,
        stage: 'job:completed',
        status: 'success',
        metadata: {
          jobId: job.id,
          returnValue: job.returnvalue,
          processingTime: job.finishedOn - job.processedOn
        }
      });
      
      telemetryService.updateComponentMetrics(`QUEUE-${queueName.toUpperCase()}`, {
        jobsCompleted: telemetryService.getComponentMetrics(`QUEUE-${queueName.toUpperCase()}`)?.jobsCompleted + 1 || 1
      });
    });

    // Job failed
    queue.on('failed', (job, err) => {
      telemetryService.addStage(job.data.telemetryId, {
        component: `QUEUE-${queueName.toUpperCase()}`,
        stage: 'job:failed',
        status: 'error',
        error: err.message,
        metadata: {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          maxAttempts: job.opts.attempts,
          failedReason: err.message
        }
      });
      
      telemetryService.updateComponentMetrics(`QUEUE-${queueName.toUpperCase()}`, {
        jobsFailed: telemetryService.getComponentMetrics(`QUEUE-${queueName.toUpperCase()}`)?.jobsFailed + 1 || 1
      });
    });

    // Job stalled (taking too long)
    queue.on('stalled', (job) => {
      telemetryService.addStage(job.data.telemetryId, {
        component: `QUEUE-${queueName.toUpperCase()}`,
        stage: 'job:stalled',
        status: 'warning',
        metadata: {
          jobId: job.id,
          stalledAt: new Date().toISOString()
        }
      });
    });
  }

  async addEmailJob(queueName, jobData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue manager not initialized');
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    try {
      const job = await queue.add(`${jobData.type}-email`, jobData, {
        ...options,
        priority: this.getJobPriority(jobData.type),
        jobId: jobData.notificationId ? `email-${jobData.notificationId}` : undefined
      });

      logger.info(`Added email job to ${queueName} queue: ${job.id}`, 'QUEUE-MANAGER');
      return job;
    } catch (error) {
      logger.error(`Failed to add job to ${queueName} queue: ${error.message}`, 'QUEUE-MANAGER');
      throw error;
    }
  }

  async addInAppJob(queueName, jobData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue manager not initialized');
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    try {
      const job = await queue.add(`${jobData.type}-inapp`, jobData, {
        ...options,
        priority: this.getJobPriority(jobData.type),
        jobId: jobData.notificationId ? `inapp-${jobData.notificationId}` : undefined
      });

      logger.info(`Added in-app notification job to ${queueName} queue: ${job.id}`, 'QUEUE-MANAGER');
      return job;
    } catch (error) {
      logger.error(`Failed to add in-app job to ${queueName} queue: ${error.message}`, 'QUEUE-MANAGER');
      throw error;
    }
  }

  async addInAppRetryJob(queueName, jobData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue manager not initialized');
    }

    const validRetryQueues = ['inappRetry1', 'inappRetry2', 'inappDlq'];
    if (!validRetryQueues.includes(queueName)) {
      throw new Error(`Invalid in-app retry queue: ${queueName}`);
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    try {
      const job = await queue.add(`${jobData.type}-inapp-retry`, jobData, {
        ...options,
        priority: this.getJobPriority(jobData.type),
        jobId: jobData.notificationId ? `inapp-retry-${jobData.notificationId}` : undefined
      });

      logger.info(`Added in-app retry job to ${queueName} queue: ${job.id}`, 'QUEUE-MANAGER');
      return job;
    } catch (error) {
      logger.error(`Failed to add in-app retry job to ${queueName} queue: ${error.message}`, 'QUEUE-MANAGER');
      throw error;
    }
  }

  async addPushJob(queueName, jobData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue manager not initialized');
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    try {
      const job = await queue.add(`${jobData.type}-push`, jobData, {
        ...options,
        priority: this.getJobPriority(jobData.type),
        jobId: jobData.notificationId ? `push-${jobData.notificationId}` : undefined
      });

      logger.info(`Added push notification job to ${queueName} queue: ${job.id}`, 'QUEUE-MANAGER');
      return job;
    } catch (error) {
      logger.error(`Failed to add push job to ${queueName} queue: ${error.message}`, 'QUEUE-MANAGER');
      throw error;
    }
  }

  async addPushRetryJob(queueName, jobData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Queue manager not initialized');
    }

    const validRetryQueues = ['pushRetry1', 'pushRetry2', 'pushDlq'];
    if (!validRetryQueues.includes(queueName)) {
      throw new Error(`Invalid push retry queue: ${queueName}`);
    }

    const queue = this.queues[queueName];
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }

    try {
      const job = await queue.add(`${jobData.type}-push-retry`, jobData, {
        ...options,
        priority: this.getJobPriority(jobData.type),
        jobId: jobData.notificationId ? `push-retry-${jobData.notificationId}` : undefined
      });

      logger.info(`Added push retry job to ${queueName} queue: ${job.id}`, 'QUEUE-MANAGER');
      return job;
    } catch (error) {
      logger.error(`Failed to add push retry job to ${queueName} queue: ${error.message}`, 'QUEUE-MANAGER');
      throw error;
    }
  }

  getJobPriority(notificationType) {
    const priorities = {
      reset_password: 10,    // Highest priority
      signup: 5,             // Medium priority  
      login: 3,              // Higher priority for real-time login alerts
      purchase: 4,           // Medium-high priority
      friend_request: 2      // Lower priority
    };
    return priorities[notificationType] || 1;
  }

  async getQueueStats() {
    if (!this.isInitialized) {
      return { error: 'Queue manager not initialized' };
    }

    try {
      const stats = {};
      
      for (const [name, queue] of Object.entries(this.queues)) {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(), 
          queue.getCompleted(),
          queue.getFailed(),
          queue.getDelayed()
        ]);

        stats[name] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          total: waiting.length + active.length + completed.length + failed.length + delayed.length
        };
      }

      return stats;
    } catch (error) {
      logger.error(`Failed to get queue stats: ${error.message}`, 'QUEUE-MANAGER');
      return { error: error.message };
    }
  }

  async cleanQueues(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    if (!this.isInitialized) {
      return false;
    }

    try {
      for (const [name, queue] of Object.entries(this.queues)) {
        await queue.clean(maxAge, 100, 'completed');
        await queue.clean(maxAge, 50, 'failed');
        logger.info(`Cleaned old jobs from ${name} queue`, 'QUEUE-MANAGER');
      }
      return true;
    } catch (error) {
      logger.error(`Failed to clean queues: ${error.message}`, 'QUEUE-MANAGER');
      return false;
    }
  }

  async pauseQueue(queueName) {
    if (!this.isInitialized || !this.queues[queueName]) {
      return false;
    }

    try {
      await this.queues[queueName].pause();
      logger.warn(`Paused ${queueName} queue`, 'QUEUE-MANAGER');
      return true;
    } catch (error) {
      logger.error(`Failed to pause ${queueName} queue: ${error.message}`, 'QUEUE-MANAGER');
      return false;
    }
  }

  async resumeQueue(queueName) {
    if (!this.isInitialized || !this.queues[queueName]) {
      return false;
    }

    try {
      await this.queues[queueName].resume();
      logger.info(`Resumed ${queueName} queue`, 'QUEUE-MANAGER');
      return true;
    } catch (error) {
      logger.error(`Failed to resume ${queueName} queue: ${error.message}`, 'QUEUE-MANAGER');
      return false;
    }
  }

  async getQueue(name) {
    return this.queues[name] || null;
  }

  async closeConnections() {
    try {
      // Close all queues
      for (const [name, queue] of Object.entries(this.queues)) {
        await queue.close();
        logger.info(`Closed ${name} queue`, 'QUEUE-MANAGER');
      }

      // Close all workers
      for (const [name, worker] of Object.entries(this.workers)) {
        await worker.close();
        logger.info(`Closed ${name} worker`, 'QUEUE-MANAGER');
      }

      // Close Redis connection
      if (this.redis) {
        await this.redis.quit();
        logger.info('Redis connection closed', 'QUEUE-MANAGER');
      }

      this.isInitialized = false;
      logger.info('Queue manager shutdown complete', 'QUEUE-MANAGER');
    } catch (error) {
      logger.error(`Error during queue manager shutdown: ${error.message}`, 'QUEUE-MANAGER');
    }
  }

  async retryFailedJobs(queueName, maxJobs = 10) {
    if (!this.isInitialized || !this.queues[queueName]) {
      return 0;
    }

    try {
      const failedJobs = await this.queues[queueName].getFailed(0, maxJobs - 1);
      let retriedCount = 0;

      for (const job of failedJobs) {
        await job.retry();
        retriedCount++;
        logger.info(`Retried failed job ${job.id} in ${queueName} queue`, 'QUEUE-MANAGER');
      }

      return retriedCount;
    } catch (error) {
      logger.error(`Failed to retry jobs in ${queueName} queue: ${error.message}`, 'QUEUE-MANAGER');
      return 0;
    }
  }
}

module.exports = new QueueManager();