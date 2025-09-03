const express = require('express');
const router = express.Router();
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const queueManager = require('../queues');
const mailWorker = require('../workers/mailWorker');
const logger = require('../utils/logger');

router.get('/health', (req, res) => {
  const serverInfo = req.serverInfo || 'Unknown';
  res.json({
    status: 'healthy',
    server: serverInfo,
    port: req.serverPort || 'Unknown',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

router.get('/server-info', (req, res) => {
  const serverInfo = req.serverInfo || 'Unknown';
  res.json({
    message: `Response from ${serverInfo}`,
    server: serverInfo,
    port: req.serverPort || 'Unknown',
    pid: process.pid,
    timestamp: new Date().toISOString()
  });
});

// Queue health endpoint
router.get('/queue-health', async (req, res) => {
  try {
    const serverInfo = req.serverInfo || 'Unknown';
    
    // Check queue manager status
    const queueStats = await queueManager.getQueueStats();
    
    // Check worker status
    const workerStats = await mailWorker.getWorkerStats();
    
    // Check email service status
    const emailHealth = await emailService.testConnection();
    
    res.json({
      status: 'healthy',
      server: serverInfo,
      timestamp: new Date().toISOString(),
      queues: queueStats,
      workers: workerStats,
      email: emailHealth
    });
  } catch (error) {
    logger.error(`Queue health check failed: ${error.message}`, req.serverInfo);
    res.status(503).json({
      status: 'unhealthy',
      server: req.serverInfo || 'Unknown',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Email system health check endpoint
router.get('/email-health', async (req, res) => {
  try {
    const serverInfo = req.serverInfo || 'Unknown';
    
    // Check if notification service is ready
    const notificationReady = notificationService.isReady();
    const emailReady = notificationService.isEmailReady();
    
    // Test email service connection
    const emailConnectionTest = await emailService.testConnection();
    
    // Check if queue manager is initialized
    const queueReady = queueManager.isInitialized;
    
    // Check if workers are running
    const workerStats = await mailWorker.getWorkerStats();
    const workersRunning = Object.values(workerStats).some(worker => worker.isRunning);
    
    const overallHealth = notificationReady && emailReady && queueReady && workersRunning;
    
    res.status(overallHealth ? 200 : 503).json({
      status: overallHealth ? 'healthy' : 'unhealthy',
      server: serverInfo,
      timestamp: new Date().toISOString(),
      components: {
        notificationService: {
          ready: notificationReady,
          emailReady: emailReady
        },
        queueManager: {
          initialized: queueReady
        },
        emailService: emailConnectionTest,
        mailWorkers: {
          running: workersRunning,
          stats: workerStats
        }
      },
      recommendations: overallHealth ? [] : [
        !notificationReady && 'Check notification service initialization',
        !emailReady && 'Check email service SMTP configuration',
        !queueReady && 'Check Redis connection for queue manager',
        !workersRunning && 'Check if mail workers are running'
      ].filter(Boolean)
    });
  } catch (error) {
    logger.error(`Email health check failed: ${error.message}`, req.serverInfo);
    res.status(503).json({
      status: 'error',
      server: req.serverInfo || 'Unknown',
      timestamp: new Date().toISOString(),
      error: error.message,
      recommendations: ['Check server logs for detailed error information']
    });
  }
});

// Notification statistics endpoint
router.get('/notification-stats', async (req, res) => {
  try {
    const serverInfo = req.serverInfo || 'Unknown';
    const stats = await notificationService.getNotificationStats();
    
    res.json({
      success: true,
      server: serverInfo,
      timestamp: new Date().toISOString(),
      stats
    });
  } catch (error) {
    logger.error(`Failed to get notification stats: ${error.message}`, req.serverInfo);
    res.status(500).json({
      success: false,
      server: req.serverInfo || 'Unknown',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Queue management endpoints
router.post('/queue/:queueName/pause', async (req, res) => {
  try {
    const { queueName } = req.params;
    const serverInfo = req.serverInfo || 'Unknown';
    
    const result = await queueManager.pauseQueue(queueName);
    
    if (result) {
      logger.info(`Queue ${queueName} paused via API`, serverInfo);
      res.json({
        success: true,
        server: serverInfo,
        message: `Queue ${queueName} paused successfully`
      });
    } else {
      res.status(400).json({
        success: false,
        server: serverInfo,
        error: `Failed to pause queue ${queueName}`
      });
    }
  } catch (error) {
    logger.error(`Failed to pause queue: ${error.message}`, req.serverInfo);
    res.status(500).json({
      success: false,
      server: req.serverInfo || 'Unknown',
      error: error.message
    });
  }
});

router.post('/queue/:queueName/resume', async (req, res) => {
  try {
    const { queueName } = req.params;
    const serverInfo = req.serverInfo || 'Unknown';
    
    const result = await queueManager.resumeQueue(queueName);
    
    if (result) {
      logger.info(`Queue ${queueName} resumed via API`, serverInfo);
      res.json({
        success: true,
        server: serverInfo,
        message: `Queue ${queueName} resumed successfully`
      });
    } else {
      res.status(400).json({
        success: false,
        server: serverInfo,
        error: `Failed to resume queue ${queueName}`
      });
    }
  } catch (error) {
    logger.error(`Failed to resume queue: ${error.message}`, req.serverInfo);
    res.status(500).json({
      success: false,
      server: req.serverInfo || 'Unknown',
      error: error.message
    });
  }
});

module.exports = router;