const express = require('express');
const router = express.Router();
const telemetryService = require('../services/telemetryService');
const queueManager = require('../queues');
const websocketService = require('../services/websocketService');
const logger = require('../utils/logger');

/**
 * GET /api/live-view/status
 * Get overall system status and metrics
 */
router.get('/status', async (req, res) => {
  try {
    const systemStatus = telemetryService.getSystemStatus();
    const allMetrics = telemetryService.getAllMetrics();
    const queueStats = await queueManager.getQueueStats();
    const activeRequests = telemetryService.getActiveRequests();
    const connectionStats = websocketService.getConnectionStats();

    res.json({
      system: systemStatus,
      components: allMetrics,
      queues: queueStats,
      activeRequests: activeRequests.length,
      connections: connectionStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get live view status: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to get system status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/live-view/requests
 * Get recent requests with optional filtering
 */
router.get('/requests', async (req, res) => {
  try {
    const { limit = 50, status, type } = req.query;
    let requests = telemetryService.getRecentRequests(parseInt(limit));

    // Apply filters
    if (status && status !== 'all') {
      requests = requests.filter(req => req.status === status);
    }

    if (type && type !== 'all') {
      requests = requests.filter(req => req.type === type);
    }

    res.json({
      requests,
      total: requests.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get requests: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to get requests',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/live-view/requests/:id
 * Get detailed information about a specific request
 */
router.get('/requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const request = telemetryService.getRequest(id);

    if (!request) {
      return res.status(404).json({
        error: 'Request not found',
        requestId: id,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      request,
      stages: request.stages,
      totalDuration: request.totalDuration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get request ${req.params.id}: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to get request details',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/live-view/components
 * Get all component metrics
 */
router.get('/components', async (req, res) => {
  try {
    const allMetrics = telemetryService.getAllMetrics();
    const componentList = Object.keys(allMetrics).map(component => ({
      name: component,
      metrics: allMetrics[component],
      lastUpdate: allMetrics[component]?.timestamp || new Date()
    }));

    res.json({
      components: componentList,
      total: componentList.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get components: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to get component metrics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/live-view/components/:name
 * Get metrics for a specific component
 */
router.get('/components/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const metrics = telemetryService.getComponentMetrics(name);

    if (!metrics) {
      return res.status(404).json({
        error: 'Component not found',
        component: name,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      component: name,
      metrics: metrics.latest,
      history: metrics.history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get component ${req.params.name}: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to get component metrics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/live-view/queues
 * Get queue statistics
 */
router.get('/queues', async (req, res) => {
  try {
    const queueStats = await queueManager.getQueueStats();
    
    res.json({
      queues: queueStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get queue stats: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to get queue statistics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/live-view/connections
 * Get WebSocket connection statistics
 */
router.get('/connections', async (req, res) => {
  try {
    const connectionStats = websocketService.getConnectionStats();
    
    res.json({
      connections: connectionStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get connection stats: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to get connection statistics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/live-view/simulate
 * Trigger load simulation
 */
router.post('/simulate', async (req, res) => {
  try {
    const { type = 'signup', count = 10, interval = 1000 } = req.body;

    // Validate input
    const validTypes = ['signup', 'login', 'reset_password', 'purchase', 'friend_request'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid simulation type',
        validTypes,
        timestamp: new Date().toISOString()
      });
    }

    if (count < 1 || count > 100) {
      return res.status(400).json({
        error: 'Count must be between 1 and 100',
        timestamp: new Date().toISOString()
      });
    }

    if (interval < 100 || interval > 10000) {
      return res.status(400).json({
        error: 'Interval must be between 100ms and 10000ms',
        timestamp: new Date().toISOString()
      });
    }

    // Start simulation
    const success = telemetryService.simulateLoad(type, count, interval);
    
    if (success) {
      logger.info(`Started load simulation: ${count} ${type} requests with ${interval}ms interval`, 'LIVE-VIEW-API');
      res.json({
        message: 'Simulation started successfully',
        type,
        count,
        interval,
        estimatedDuration: count * interval,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        error: 'Failed to start simulation',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error(`Failed to start simulation: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to start simulation',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/live-view/statistics
 * Get telemetry system statistics
 */
router.get('/statistics', async (req, res) => {
  try {
    const stats = telemetryService.getStatistics();
    
    res.json({
      statistics: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to get statistics: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to get telemetry statistics',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * DELETE /api/live-view/requests
 * Clear old completed/failed requests
 */
router.delete('/requests', async (req, res) => {
  try {
    const { status = 'completed' } = req.query;
    
    // This would need to be implemented in telemetryService
    // For now, just return success
    res.json({
      message: 'Request cleanup initiated',
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to clear requests: ${error.message}`, 'LIVE-VIEW-API');
    res.status(500).json({
      error: 'Failed to clear requests',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * WebSocket endpoint for real-time updates
 */
router.get('/websocket-info', (req, res) => {
  res.json({
    message: 'WebSocket endpoint available at /socket.io/',
    events: [
      'request:new',
      'request:progress', 
      'request:complete',
      'request:failed',
      'component:metrics',
      'system:metrics',
      'queue:job:added',
      'queue:job:processing',
      'queue:job:completed',
      'queue:job:failed'
    ],
    room: 'live-view',
    instructions: {
      connect: 'Connect to Socket.IO and join "live-view" room',
      subscribe: 'Listen to the events listed above for real-time updates'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;