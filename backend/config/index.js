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
    connectTimeout: 10000,
    lazyConnect: true,
    // Optimized connection settings to reduce Redis load
    family: 4,
    keepAlive: true,
    enableReadyCheck: false,
    // Connection pooling
    enableAutoPipelining: true,
    // Additional connection limits
    maxLoadingTimeout: 2000,
    commandTimeout: 5000
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
    },
    inapp: {
      name: 'inapp-notification-queue',
      concurrency: parseInt(process.env.INAPP_QUEUE_CONCURRENCY) || 10,
      attempts: parseInt(process.env.INAPP_MAX_ATTEMPTS) || 3
    },
    inappRetry1: {
      name: 'inapp-retry-1-queue',
      delay: parseInt(process.env.INAPP_RETRY_1_DELAY) || 120000, // 2 minutes
      concurrency: parseInt(process.env.INAPP_RETRY_1_CONCURRENCY) || 5,
      attempts: parseInt(process.env.INAPP_RETRY_1_MAX_ATTEMPTS) || 3
    },
    inappRetry2: {
      name: 'inapp-retry-2-queue', 
      delay: parseInt(process.env.INAPP_RETRY_2_DELAY) || 600000, // 10 minutes
      concurrency: parseInt(process.env.INAPP_RETRY_2_CONCURRENCY) || 3,
      attempts: parseInt(process.env.INAPP_RETRY_2_MAX_ATTEMPTS) || 2
    },
    inappDlq: {
      name: 'inapp-dead-letter-queue',
      concurrency: parseInt(process.env.INAPP_DLQ_CONCURRENCY) || 1
    },
    push: {
      name: 'push-notification-queue',
      concurrency: parseInt(process.env.PUSH_QUEUE_CONCURRENCY) || 8,
      attempts: parseInt(process.env.PUSH_MAX_ATTEMPTS) || 3
    },
    pushRetry1: {
      name: 'push-retry-1-queue',
      delay: parseInt(process.env.PUSH_RETRY_1_DELAY) || 300000, // 5 minutes
      concurrency: parseInt(process.env.PUSH_RETRY_1_CONCURRENCY) || 5,
      attempts: parseInt(process.env.PUSH_RETRY_1_MAX_ATTEMPTS) || 2
    },
    pushRetry2: {
      name: 'push-retry-2-queue',
      delay: parseInt(process.env.PUSH_RETRY_2_DELAY) || 1800000, // 30 minutes
      concurrency: parseInt(process.env.PUSH_RETRY_2_CONCURRENCY) || 3,
      attempts: parseInt(process.env.PUSH_RETRY_2_MAX_ATTEMPTS) || 1
    },
    pushDlq: {
      name: 'push-dead-letter-queue',
      concurrency: parseInt(process.env.PUSH_DLQ_CONCURRENCY) || 1
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
  
  firebase: (() => {
    // Try to load from service account file first
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      try {
        const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        return {
          projectId: serviceAccount.project_id,
          privateKey: serviceAccount.private_key,
          clientEmail: serviceAccount.client_email,
          databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
          storageBucket: `${serviceAccount.project_id}.appspot.com`,
          fcmServerKey: process.env.FCM_SERVER_KEY,
          vapidKey: process.env.FCM_VAPID_KEY || 'BPB0ZMeEdSl7GtjgB_X3ssiXLJt_4Qld4bgjFA-wHaRT31RIbgh6b05OTmhEZ4FNZzc7TVp3k72KMvJLEM-kbMA',
          messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '1024557267709',
          appId: process.env.FIREBASE_APP_ID || '1:1024557267709:web:de714ed1b703418b159c94',
          measurementId: process.env.FIREBASE_MEASUREMENT_ID || 'G-T2HZ1JW8QZ'
        };
      } catch (error) {
        console.warn('Failed to load Firebase service account file, falling back to env vars');
      }
    }
    
    // Fall back to individual environment variables
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY ? 
        process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      fcmServerKey: process.env.FCM_SERVER_KEY,
      vapidKey: process.env.FCM_VAPID_KEY,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID
    };
  })(),
  
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