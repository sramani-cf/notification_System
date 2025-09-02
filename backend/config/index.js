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
  
  notification: {
    retryAttempts: parseInt(process.env.NOTIFICATION_RETRY_ATTEMPTS) || 3,
    retryDelay: parseInt(process.env.NOTIFICATION_RETRY_DELAY) || 3000,
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