require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  
  server: {
    loadBalancerPort: parseInt(process.env.LOAD_BALANCER_PORT) || 8000,
    server1Port: parseInt(process.env.SERVER1_PORT) || 5001,
    server2Port: parseInt(process.env.SERVER2_PORT) || 5002,
    server3Port: parseInt(process.env.SERVER3_PORT) || 5003,
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000
  },
  
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/notification_system',
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    }
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    credentials: true,
    optionsSuccessStatus: 200
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    username: process.env.REDIS_USERNAME || null,
    password: process.env.REDIS_PASSWORD || null,
    db: parseInt(process.env.REDIS_DB) || 0,
    maxRetriesPerRequest: null, // Required by BullMQ
    retryDelayOnFailover: 200,
    maxmemoryPolicy: 'allkeys-lru',
    connectTimeout: 15000,
    lazyConnect: true,
    // Optimized connection settings to reduce Redis load
    family: 4,
    keepAlive: true,
    enableReadyCheck: false,
    // Connection pooling
    enableAutoPipelining: true
  },

  queues: {
    mail: {
      name: 'mail-queue',
      concurrency: parseInt(process.env.MAIL_QUEUE_CONCURRENCY) || 5
    },
    retry1: {
      name: 'retry-1-queue',
      delay: parseInt(process.env.RETRY_1_DELAY) || 300000, // 5 minutes
      concurrency: parseInt(process.env.RETRY_1_CONCURRENCY) || 3
    },
    retry2: {
      name: 'retry-2-queue', 
      delay: parseInt(process.env.RETRY_2_DELAY) || 1800000, // 30 minutes
      concurrency: parseInt(process.env.RETRY_2_CONCURRENCY) || 2
    },
    dlq: {
      name: 'dead-letter-queue',
      concurrency: parseInt(process.env.DLQ_CONCURRENCY) || 1
    }
  },

  notification: {
    inProcessRetries: [
      { attempt: 1, delay: 0 },      // Immediate
      { attempt: 2, delay: 1000 },   // 1 second
      { attempt: 3, delay: 2000 },   // 2 seconds  
      { attempt: 4, delay: 4000 }    // 4 seconds
    ],
    maxAttempts: parseInt(process.env.NOTIFICATION_MAX_ATTEMPTS) || 4,
    cleanupDaysOld: parseInt(process.env.NOTIFICATION_CLEANUP_DAYS) || 30
  },
  
  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    jwtExpire: process.env.JWT_EXPIRE || '24h',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10
  },
  
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    from: process.env.EMAIL_FROM || 'noreply@notification-system.com'
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    directory: process.env.LOG_DIRECTORY || './logs'
  },
  
  healthCheck: {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 10000,
    timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000
  },
  
  isDevelopment: function() {
    return this.env === 'development';
  },
  
  isProduction: function() {
    return this.env === 'production';
  },
  
  isTest: function() {
    return this.env === 'test';
  }
};

module.exports = config;