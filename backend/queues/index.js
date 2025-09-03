const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

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
    const connection = {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db
    };

    // Add username if provided
    if (config.redis.username) {
      connection.username = config.redis.username;
    }

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

    // Dead Letter Queue - for permanently failed messages
    this.queues.dlq = new Queue(config.queues.dlq.name, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
        attempts: 1 // No retries in DLQ
      }
    });

    logger.info('All queues initialized successfully', 'QUEUE-MANAGER');
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

  getJobPriority(emailType) {
    const priorities = {
      reset_password: 10,    // Highest priority
      signup: 5,             // Medium priority  
      login: 1               // Lower priority
    };
    return priorities[emailType] || 1;
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