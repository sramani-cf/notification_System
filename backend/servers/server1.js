require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB } = require('../config/db');
const apiRoutes = require('../routes');
const logger = require('../utils/logger');

const app = express();
const PORT = process.env.SERVER1_PORT || 5001;
const SERVER_NAME = 'SERVER-1';

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
    await connectDB(SERVER_NAME);
    
    const server = app.listen(PORT, () => {
      logger.success(`${SERVER_NAME} running on port ${PORT}`, SERVER_NAME);
      logger.info(`Process ID: ${process.pid}`, SERVER_NAME);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`, SERVER_NAME);
    });
    
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server', SERVER_NAME);
      server.close(() => {
        logger.info('HTTP server closed', SERVER_NAME);
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT signal received: closing HTTP server', SERVER_NAME);
      server.close(() => {
        logger.info('HTTP server closed', SERVER_NAME);
        process.exit(0);
      });
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