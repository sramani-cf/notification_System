const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class TelemetryService {
  constructor() {
    this.io = null;
    this.requests = new Map();
    this.metrics = new Map();
    this.isInitialized = false;
    this.systemStats = {
      startTime: new Date(),
      totalRequests: 0,
      activeRequests: 0,
      completedRequests: 0,
      failedRequests: 0
    };
    
    // Cleanup old requests every 5 minutes
    setInterval(() => this.cleanupOldRequests(), 5 * 60 * 1000);
    
    // Update system metrics every second
    setInterval(() => this.updateSystemMetrics(), 1000);
  }

  initialize(socketIoInstance) {
    this.io = socketIoInstance;
    this.isInitialized = true;
    logger.success('Telemetry service initialized successfully', 'TELEMETRY');
    return true;
  }

  /**
   * Generate a unique request ID
   */
  generateRequestId() {
    return uuidv4();
  }

  /**
   * Start tracking a new request
   */
  trackRequest(type, metadata = {}) {
    const requestId = this.generateRequestId();
    const request = {
      id: requestId,
      type: type,
      status: 'initiated',
      startTime: new Date(),
      stages: [],
      currentStage: null,
      metadata: {
        ...metadata,
        serverInfo: metadata.serverInfo || 'UNKNOWN',
        userAgent: metadata.userAgent || 'Unknown',
        ip: metadata.ip || 'Unknown'
      },
      totalDuration: 0,
      errors: []
    };

    this.requests.set(requestId, request);
    this.systemStats.totalRequests++;
    this.systemStats.activeRequests++;
    
    this.emit('request:new', request);
    logger.info(`Started tracking request ${requestId} (${type})`, 'TELEMETRY');
    
    return requestId;
  }

  /**
   * Update request stage
   */
  updateRequestStage(requestId, stage, component, metadata = {}) {
    const request = this.requests.get(requestId);
    if (!request) {
      logger.warn(`Request ${requestId} not found for stage update`, 'TELEMETRY');
      return false;
    }

    const now = new Date();
    const stageData = {
      stage: stage,
      component: component,
      startTime: now,
      endTime: null,
      duration: null,
      status: 'processing',
      metadata: metadata
    };

    // Complete previous stage if exists
    if (request.currentStage) {
      const prevStageIndex = request.stages.length - 1;
      if (prevStageIndex >= 0) {
        request.stages[prevStageIndex].endTime = now;
        request.stages[prevStageIndex].duration = now - request.stages[prevStageIndex].startTime;
        request.stages[prevStageIndex].status = 'completed';
      }
    }

    request.stages.push(stageData);
    request.currentStage = stage;
    request.status = 'processing';

    this.emit('request:progress', {
      requestId,
      stage: stageData,
      totalStages: request.stages.length,
      request: request
    });

    return true;
  }

  /**
   * Complete a request stage
   */
  completeRequestStage(requestId, result = {}) {
    const request = this.requests.get(requestId);
    if (!request || request.stages.length === 0) {
      return false;
    }

    const now = new Date();
    const currentStageIndex = request.stages.length - 1;
    const currentStage = request.stages[currentStageIndex];
    
    currentStage.endTime = now;
    currentStage.duration = now - currentStage.startTime;
    currentStage.status = 'completed';
    currentStage.result = result;

    this.emit('request:stage:complete', {
      requestId,
      stage: currentStage,
      request: request
    });

    return true;
  }

  /**
   * Complete entire request
   */
  completeRequest(requestId, result = {}) {
    const request = this.requests.get(requestId);
    if (!request) {
      logger.warn(`Request ${requestId} not found for completion`, 'TELEMETRY');
      return false;
    }

    // Complete current stage if processing
    this.completeRequestStage(requestId, result);

    const now = new Date();
    request.status = 'completed';
    request.endTime = now;
    request.totalDuration = now - request.startTime;
    request.result = result;

    this.systemStats.activeRequests--;
    this.systemStats.completedRequests++;

    this.emit('request:complete', request);
    logger.info(`Completed request ${requestId} in ${request.totalDuration}ms`, 'TELEMETRY');

    return true;
  }

  /**
   * Mark request as failed
   */
  failRequest(requestId, error, stage = null) {
    const request = this.requests.get(requestId);
    if (!request) {
      logger.warn(`Request ${requestId} not found for failure`, 'TELEMETRY');
      return false;
    }

    const now = new Date();
    const errorData = {
      message: error.message || error,
      stage: stage || request.currentStage,
      timestamp: now,
      stack: error.stack || null
    };

    request.errors.push(errorData);
    request.status = 'failed';
    request.endTime = now;
    request.totalDuration = now - request.startTime;

    // Complete current stage as failed
    if (request.stages.length > 0) {
      const currentStage = request.stages[request.stages.length - 1];
      currentStage.endTime = now;
      currentStage.duration = now - currentStage.startTime;
      currentStage.status = 'failed';
      currentStage.error = errorData;
    }

    this.systemStats.activeRequests--;
    this.systemStats.failedRequests++;

    this.emit('request:failed', {
      request,
      error: errorData
    });

    logger.error(`Failed request ${requestId}: ${errorData.message}`, 'TELEMETRY');
    return true;
  }

  /**
   * Get request by ID
   */
  getRequest(requestId) {
    return this.requests.get(requestId);
  }

  /**
   * Get all active requests
   */
  getActiveRequests() {
    const activeRequests = [];
    for (const [id, request] of this.requests) {
      if (request.status === 'processing' || request.status === 'initiated') {
        activeRequests.push(request);
      }
    }
    return activeRequests;
  }

  /**
   * Get recent requests
   */
  getRecentRequests(limit = 100) {
    const requests = Array.from(this.requests.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
    return requests;
  }

  /**
   * Track component metrics
   */
  updateComponentMetrics(component, metrics) {
    const timestamp = new Date();
    
    if (!this.metrics.has(component)) {
      this.metrics.set(component, {
        component,
        history: [],
        latest: null
      });
    }

    const componentMetrics = this.metrics.get(component);
    componentMetrics.latest = { ...metrics, timestamp };
    componentMetrics.history.push({ ...metrics, timestamp });

    // Keep only last 100 entries
    if (componentMetrics.history.length > 100) {
      componentMetrics.history.shift();
    }

    this.emit('component:metrics', {
      component,
      metrics: componentMetrics.latest
    });

    return true;
  }

  /**
   * Get component metrics
   */
  getComponentMetrics(component) {
    return this.metrics.get(component) || null;
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    const allMetrics = {};
    for (const [component, data] of this.metrics) {
      allMetrics[component] = data.latest;
    }
    return allMetrics;
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    const now = new Date();
    const uptime = now - this.systemStats.startTime;
    
    return {
      status: this.determineSystemHealth(),
      uptime: uptime,
      totalRequests: this.systemStats.totalRequests,
      activeRequests: this.systemStats.activeRequests,
      completedRequests: this.systemStats.completedRequests,
      failedRequests: this.systemStats.failedRequests,
      errorRate: this.systemStats.totalRequests > 0 
        ? (this.systemStats.failedRequests / this.systemStats.totalRequests) * 100 
        : 0,
      requestsPerSecond: this.calculateRequestsPerSecond(),
      averageLatency: this.calculateAverageLatency(),
      timestamp: now
    };
  }

  /**
   * Determine system health based on metrics
   */
  determineSystemHealth() {
    const errorRate = this.systemStats.totalRequests > 0 
      ? (this.systemStats.failedRequests / this.systemStats.totalRequests) * 100 
      : 0;

    if (errorRate > 10) return 'critical';
    if (errorRate > 5) return 'degraded';
    return 'healthy';
  }

  /**
   * Calculate requests per second
   */
  calculateRequestsPerSecond() {
    const recentRequests = this.getRecentRequests(100);
    const oneMinuteAgo = new Date(Date.now() - 60000);
    
    const recentCount = recentRequests.filter(req => req.startTime > oneMinuteAgo).length;
    return Math.round(recentCount / 60 * 100) / 100; // Requests per second
  }

  /**
   * Calculate average latency
   */
  calculateAverageLatency() {
    const recentRequests = this.getRecentRequests(50)
      .filter(req => req.status === 'completed' && req.totalDuration);
    
    if (recentRequests.length === 0) return 0;
    
    const totalDuration = recentRequests.reduce((sum, req) => sum + req.totalDuration, 0);
    return Math.round(totalDuration / recentRequests.length);
  }

  /**
   * Update system metrics periodically
   */
  updateSystemMetrics() {
    const systemStatus = this.getSystemStatus();
    this.emit('system:metrics', systemStatus);
  }

  /**
   * Emit event to connected live view clients
   */
  emit(event, data) {
    if (this.io && this.isInitialized) {
      this.io.to('live-view').emit(event, data);
    }
  }

  /**
   * Clean up old requests to prevent memory leaks
   */
  cleanupOldRequests() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [requestId, request] of this.requests) {
      if (request.startTime < oneHourAgo && request.status !== 'processing') {
        this.requests.delete(requestId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old requests from telemetry`, 'TELEMETRY');
    }
  }

  /**
   * Generate load simulation
   */
  simulateLoad(type, count = 10, interval = 1000) {
    if (!this.isInitialized) {
      logger.warn('Telemetry service not initialized for simulation', 'TELEMETRY');
      return false;
    }

    logger.info(`Starting load simulation: ${count} ${type} requests with ${interval}ms interval`, 'TELEMETRY');
    
    let generated = 0;
    const simulationInterval = setInterval(() => {
      if (generated >= count) {
        clearInterval(simulationInterval);
        logger.info(`Load simulation completed: ${generated} requests generated`, 'TELEMETRY');
        return;
      }

      // Generate simulated request
      const requestId = this.trackRequest(type, {
        simulated: true,
        serverInfo: 'SIMULATION',
        ip: '127.0.0.1',
        userAgent: 'Load-Simulator'
      });

      // Simulate request progression
      setTimeout(() => this.updateRequestStage(requestId, 'load-balancer', 'LoadBalancer'), 50);
      setTimeout(() => this.updateRequestStage(requestId, 'server', 'Server'), 100);
      setTimeout(() => this.updateRequestStage(requestId, 'controller', 'Controller'), 200);
      setTimeout(() => this.updateRequestStage(requestId, 'queue', 'Queue'), 300);
      setTimeout(() => this.updateRequestStage(requestId, 'worker', 'Worker'), 800);
      setTimeout(() => this.completeRequest(requestId, { simulated: true }), 1200);

      generated++;
    }, interval);

    return true;
  }

  /**
   * Get telemetry statistics
   */
  getStatistics() {
    return {
      requests: {
        total: this.requests.size,
        active: this.getActiveRequests().length,
        completed: Array.from(this.requests.values()).filter(r => r.status === 'completed').length,
        failed: Array.from(this.requests.values()).filter(r => r.status === 'failed').length
      },
      components: this.metrics.size,
      uptime: Date.now() - this.systemStats.startTime,
      memoryUsage: {
        requests: this.requests.size,
        metrics: this.metrics.size
      }
    };
  }

  /**
   * Shutdown telemetry service
   */
  shutdown() {
    this.requests.clear();
    this.metrics.clear();
    this.isInitialized = false;
    logger.info('Telemetry service shutdown complete', 'TELEMETRY');
  }
}

module.exports = new TelemetryService();