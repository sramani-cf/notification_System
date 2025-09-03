require('dotenv').config(); // restart
const express = require('express');
const cors = require('cors');
const { connectDB } = require('../config/db');
const apiRoutes = require('../routes');
const notificationService = require('../services/notificationService');
const mailWorker = require('../workers/mailWorker');
const logger = require('../utils/logger');

const app = express();
const PORT = process.env.SERVER2_PORT || 5002;
const SERVER_NAME = 'SERVER-2';

logger.setServerName(SERVER_NAME);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  req.serverInfo = SERVER_NAME;
  req.serverPort = PORT;
  res.setHeader('X-Server-Info', SERVER_NAME);
  res.setHeader('X-Server-Port', PORT);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.request(req.method, req.originalUrl, SERVER_NAME, res.statusCode);
    if (duration > 1000) {
      logger.warn(`Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`, SERVER_NAME);
    }
  });
  
  next();
});

const { errorHandler, notFound } = require('../middleware/errorHandler');

app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.json({
    message: `Hello from ${SERVER_NAME}`,
    server: SERVER_NAME,
    port: PORT,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `The requested resource was not found on ${SERVER_NAME}`,
    path: req.originalUrl,
    server: SERVER_NAME
  });
});

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, SERVER_NAME);
  
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message,
    server: SERVER_NAME,
    timestamp: new Date().toISOString()
  });
});

const startServer = async () => {
  try {
    // Initialize database connection
    await connectDB(SERVER_NAME);
    
    // Initialize notification system (queues, workers, email service)
    logger.info('Initializing notification system...', SERVER_NAME);
    
    // Critical: Notification system must be initialized for login emails to work
    await notificationService.initialize();
    logger.success('Notification service initialized', SERVER_NAME);
    
    await mailWorker.initialize();
    logger.success('Mail workers initialized', SERVER_NAME);
    
    // Verify email system is working
    if (!notificationService.isEmailReady()) {
      logger.warn('Email service is not ready - login notifications may not work properly', SERVER_NAME);
      logger.warn('Check SMTP configuration and credentials in .env file', SERVER_NAME);
    } else {
      logger.success('Email system is ready and operational', SERVER_NAME);
    }
    
    const server = app.listen(PORT, () => {
      logger.success(`${SERVER_NAME} running on port ${PORT}`, SERVER_NAME);
      logger.info(`Process ID: ${process.pid}`, SERVER_NAME);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`, SERVER_NAME);
    });
    
    const gracefulShutdown = async () => {
      logger.info('Starting graceful shutdown...', SERVER_NAME);
      
      // Close HTTP server first
      server.close(async () => {
        logger.info('HTTP server closed', SERVER_NAME);
        
        // Close notification system
        try {
          await mailWorker.closeWorkers();
          await notificationService.shutdown();
          logger.info('Notification system shutdown complete', SERVER_NAME);
        } catch (shutdownError) {
          logger.error(`Error during notification system shutdown: ${shutdownError.message}`, SERVER_NAME);
        }
        
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server', SERVER_NAME);
      gracefulShutdown();
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT signal received: closing HTTP server', SERVER_NAME);
      gracefulShutdown();
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`, SERVER_NAME);
    });
    
    process.on('uncaughtException', (error) => {
      logger.error(`Uncaught Exception: ${error.message}`, SERVER_NAME);
      process.exit(1);
    });
    
  } catch (error) {
    logger.error(`Failed to start ${SERVER_NAME}: ${error.message}`, SERVER_NAME);
    process.exit(1);
  }
};

startServer();