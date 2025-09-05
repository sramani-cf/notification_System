require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const http = require('http');
const logger = require('../utils/logger');
const telemetryService = require('../services/telemetryService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.LOAD_BALANCER_PORT || 8000;

logger.setServerName('BALANCER');

const servers = [
  { url: `http://localhost:${process.env.SERVER1_PORT || 5001}`, name: 'SERVER-1', healthy: true },
  { url: `http://localhost:${process.env.SERVER2_PORT || 5002}`, name: 'SERVER-2', healthy: true },
  { url: `http://localhost:${process.env.SERVER3_PORT || 5003}`, name: 'SERVER-3', healthy: true }
];

let currentServerIndex = 0;

// Store WebSocket connections for sticky sessions
const wsConnections = new Map(); // socketId -> serverIndex
const sessionToServer = new Map(); // Socket.IO session ID -> server URL
const clientToServer = new Map(); // Client IP + User-Agent hash -> server URL

// Extract Socket.IO session ID from request
const extractSocketIOSessionId = (req) => {
  const url = new URL(req.url, 'http://localhost');
  // Use 'sid' parameter which is the actual Socket.IO session ID
  // 'EIO' is just the Engine.IO version
  return url.searchParams.get('sid');
};

// Generate client hash for sticky sessions
const getClientHash = (req) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  return `${ip}-${userAgent}`.substring(0, 50); // Limit length
};

// Get server for Socket.IO with sticky session support
const getSocketIOServer = (req) => {
  const sessionId = extractSocketIOSessionId(req);
  const clientHash = getClientHash(req);
  
  // SIMPLIFIED APPROACH: Always route by client hash first, then by session ID
  // This ensures the same client always goes to the same server
  
  // If we have a session ID and it's already mapped, use it
  if (sessionId && sessionToServer.has(sessionId)) {
    const serverUrl = sessionToServer.get(sessionId);
    const server = servers.find(s => s.url === serverUrl);
    if (server && server.healthy) {
      logger.info(`Using session mapping: ${sessionId} -> ${server.name}`, 'BALANCER');
      return server;
    } else {
      // Clean up stale session
      sessionToServer.delete(sessionId);
      logger.warn(`Cleaned up stale session: ${sessionId}`, 'BALANCER');
    }
  }
  
  // Use client hash for consistent routing (most important for Socket.IO)
  if (clientToServer.has(clientHash)) {
    const serverUrl = clientToServer.get(clientHash);
    const server = servers.find(s => s.url === serverUrl);
    if (server && server.healthy) {
      // If we have a session ID, also map it for faster future lookups
      if (sessionId && !sessionToServer.has(sessionId)) {
        sessionToServer.set(sessionId, serverUrl);
        logger.info(`Added session mapping: ${sessionId} -> ${server.name}`, 'BALANCER');
      }
      logger.info(`Using client mapping: ${clientHash.substring(0, 15)}... -> ${server.name}`, 'BALANCER');
      return server;
    } else {
      // Clean up stale client mapping
      clientToServer.delete(clientHash);
      logger.warn(`Cleaned up stale client mapping: ${clientHash.substring(0, 15)}...`, 'BALANCER');
    }
  }
  
  // No existing mapping - create new one
  const server = getNextHealthyServer();
  if (server) {
    // Always create client mapping
    clientToServer.set(clientHash, server.url);
    
    // Also create session mapping if we have a session ID
    if (sessionId) {
      sessionToServer.set(sessionId, server.url);
      logger.info(`Created new mappings: client=${clientHash.substring(0, 15)}..., session=${sessionId} -> ${server.name}`, 'BALANCER');
    } else {
      logger.info(`Created new client mapping: ${clientHash.substring(0, 15)}... -> ${server.name}`, 'BALANCER');
    }
  }
  
  return server;
};

const getNextHealthyServer = () => {
  const startIndex = currentServerIndex;
  let attempts = 0;
  
  while (attempts < servers.length) {
    const server = servers[currentServerIndex];
    currentServerIndex = (currentServerIndex + 1) % servers.length;
    
    if (server.healthy) {
      logger.info(`Routing to ${server.name} at ${server.url}`, 'BALANCER');
      return server;
    }
    
    attempts++;
  }
  
  logger.error('No healthy servers available!', 'BALANCER');
  return null;
};

const healthCheck = async () => {
  const healthPromises = servers.map(async (server) => {
    try {
      const response = await axios.get(`${server.url}/api/health`, {
        timeout: 3000, // Reduced timeout for faster detection
        headers: {
          'User-Agent': 'LoadBalancer-HealthCheck/1.0'
        }
      });
      
      if (response.status === 200) {
        if (!server.healthy) {
          logger.success(`${server.name} is back online`, 'BALANCER');
        }
        server.healthy = true;
      } else {
        if (server.healthy) {
          logger.warn(`${server.name} returned status ${response.status}`, 'BALANCER');
        }
        server.healthy = false;
      }
    } catch (error) {
      if (server.healthy) {
        logger.error(`${server.name} health check failed: ${error.code || error.message}`, 'BALANCER');
      }
      server.healthy = false;
    }
  });

  await Promise.allSettled(healthPromises);
  
  const healthyCount = servers.filter(s => s.healthy).length;
  if (healthyCount === 0) {
    logger.warn('No healthy servers available!', 'BALANCER');
  }
};

// Start health checks immediately when servers are likely ready
setTimeout(healthCheck, 5000);

// Run health checks every 5 seconds for faster recovery
setInterval(healthCheck, 5000);

// Session cleanup - remove stale sessions every 5 minutes
setInterval(() => {
  const staleThreshold = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  
  let cleanedSessions = 0;
  let cleanedClients = 0;
  
  // Clean up old session mappings (they should be refreshed by active connections)
  for (const [sessionId, serverUrl] of sessionToServer.entries()) {
    // For now, we'll keep sessions unless the server is unhealthy
    const server = servers.find(s => s.url === serverUrl);
    if (!server || !server.healthy) {
      sessionToServer.delete(sessionId);
      cleanedSessions++;
    }
  }
  
  // Note: Client mappings are kept longer as they help with initial connections
  // They will be cleaned up when servers become unhealthy
  
  if (cleanedSessions > 0 || cleanedClients > 0) {
    logger.info(`Session cleanup: removed ${cleanedSessions} sessions, ${cleanedClients} clients`, 'BALANCER');
  }
}, 5 * 60 * 1000);

// Parse JSON bodies before proxying
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store routing decisions to avoid conflicts
const routingCache = new Map();

const proxyOptions = {
  changeOrigin: true,
  logLevel: 'silent',
  ws: true, // Enable WebSocket proxying
  router: (req) => {
    // For Socket.IO requests, use sticky session routing
    if (req.url && req.url.startsWith('/socket.io/')) {
      const server = getSocketIOServer(req);
      if (!server) {
        throw new Error('No healthy servers available for Socket.IO');
      }
      return server.url;
    }
    
    // For regular API requests, use round-robin
    const cacheKey = req.headers['x-request-id'] || `${Date.now()}-${Math.random()}`;
    
    if (!routingCache.has(cacheKey)) {
      const server = getNextHealthyServer();
      if (!server) {
        throw new Error('No healthy servers available');
      }
      routingCache.set(cacheKey, server.url);
      
      // Clean cache after 30 seconds
      setTimeout(() => routingCache.delete(cacheKey), 30000);
    }
    
    return routingCache.get(cacheKey);
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add unique request ID for routing consistency
    const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random()}`;
    proxyReq.setHeader('X-Request-ID', requestId);
    proxyReq.setHeader('X-Load-Balancer', 'Active');
    
    // Track telemetry for API requests (not Socket.IO)
    if (req.url && req.url.startsWith('/api/')) {
      try {
        const requestType = req.url.includes('/signups') ? 'signup' :
                           req.url.includes('/logins') ? 'login' :
                           req.url.includes('/reset-passwords') ? 'reset_password' :
                           req.url.includes('/purchases') ? 'purchase' :
                           req.url.includes('/friend-requests') ? 'friend_request' :
                           'api_request';
        
        const telemetryId = telemetryService.trackRequest(requestType, {
          method: req.method,
          url: req.url,
          ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          userAgent: req.headers['user-agent'],
          serverInfo: 'LOAD-BALANCER'
        });
        
        // Store telemetry ID for response tracking
        proxyReq.setHeader('X-Telemetry-ID', telemetryId);
        
        // Update to load balancer stage
        telemetryService.updateRequestStage(telemetryId, 'load-balancer', 'LoadBalancer', {
          selectedServer: proxyReq.getHeader('host') || 'unknown',
          algorithm: 'round-robin'
        });
        
      } catch (error) {
        logger.warn(`Telemetry tracking failed: ${error.message}`, 'BALANCER');
      }
    }
    
    // Log Socket.IO requests for debugging
    if (req.url && req.url.startsWith('/socket.io/')) {
      logger.info(`Socket.IO HTTP request: ${req.method} ${req.url}`, 'BALANCER');
    }
    
    // Fix body parsing for POST/PUT/PATCH requests
    if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    const serverHeader = proxyRes.headers['x-server-info'];
    if (serverHeader) {
      logger.info(`Response from ${serverHeader}`, 'BALANCER');
    }
    
    // Complete telemetry tracking for load balancer stage
    const telemetryId = proxyRes.headers['x-telemetry-id'] || req.headers['x-telemetry-id'];
    if (telemetryId && req.url && req.url.startsWith('/api/')) {
      try {
        telemetryService.completeRequestStage(telemetryId, {
          statusCode: proxyRes.statusCode,
          responseHeaders: Object.keys(proxyRes.headers).length,
          targetServer: serverHeader || 'unknown'
        });
      } catch (error) {
        logger.warn(`Telemetry completion failed: ${error.message}`, 'BALANCER');
      }
    }
  },
  onProxyReqWs: (proxyReq, req, socket, options, head) => {
    logger.info('WebSocket proxy request initiated', 'BALANCER');
    
    // Add unique request ID for WebSocket routing consistency
    const requestId = req.headers['x-request-id'] || `${Date.now()}-${Math.random()}`;
    proxyReq.setHeader('X-Request-ID', requestId);
    proxyReq.setHeader('X-Load-Balancer', 'WebSocket-Active');
    
    // Ensure proper WebSocket headers
    proxyReq.setHeader('Upgrade', 'websocket');
    proxyReq.setHeader('Connection', 'Upgrade');
    
    if (req.headers['sec-websocket-key']) {
      proxyReq.setHeader('Sec-WebSocket-Key', req.headers['sec-websocket-key']);
    }
    if (req.headers['sec-websocket-version']) {
      proxyReq.setHeader('Sec-WebSocket-Version', req.headers['sec-websocket-version']);
    }
    if (req.headers['sec-websocket-protocol']) {
      proxyReq.setHeader('Sec-WebSocket-Protocol', req.headers['sec-websocket-protocol']);
    }
  },
  onProxyResWs: (proxyRes, proxySocket, proxyHead) => {
    logger.info('WebSocket proxy response received', 'BALANCER');
  },
  onError: (err, req, res, target) => {
    if (req.upgrade) {
      logger.error(`WebSocket proxy error: ${err.message}`, 'BALANCER');
      // WebSocket errors are handled differently, no response object
    } else {
      logger.error(`HTTP proxy error: ${err.message}`, 'BALANCER');
      if (res && !res.headersSent) {
        res.status(503).json({
          error: 'Service temporarily unavailable',
          message: 'All backend servers are currently down. Please try again later.',
          timestamp: new Date().toISOString()
        });
      }
    }
  }
};

app.get('/balancer/status', (req, res) => {
  const serverStatus = servers.map(server => ({
    name: server.name,
    url: server.url,
    healthy: server.healthy
  }));
  
  const healthyCount = servers.filter(s => s.healthy).length;
  
  res.json({
    loadBalancer: 'Active',
    port: PORT,
    totalServers: servers.length,
    healthyServers: healthyCount,
    unhealthyServers: servers.length - healthyCount,
    servers: serverStatus,
    currentIndex: currentServerIndex,
    stickySession: {
      totalSessions: sessionToServer.size,
      totalClients: clientToServer.size,
      sessionMappings: Object.fromEntries(Array.from(sessionToServer.entries()).slice(0, 10)), // Show first 10
      clientMappings: Object.fromEntries(Array.from(clientToServer.entries()).slice(0, 10)) // Show first 10
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/balancer/health', (req, res) => {
  const healthyServers = servers.filter(s => s.healthy).length;
  
  if (healthyServers === 0) {
    return res.status(503).json({
      status: 'unhealthy',
      message: 'No backend servers available',
      healthyServers: 0
    });
  }
  
  res.json({
    status: 'healthy',
    healthyServers,
    totalServers: servers.length,
    uptime: process.uptime()
  });
});

app.post('/balancer/servers/:serverName/toggle', (req, res) => {
  const { serverName } = req.params;
  const server = servers.find(s => s.name === serverName);
  
  if (!server) {
    return res.status(404).json({
      error: 'Server not found',
      availableServers: servers.map(s => s.name)
    });
  }
  
  server.healthy = !server.healthy;
  logger.warn(`Manually toggled ${server.name} to ${server.healthy ? 'healthy' : 'unhealthy'}`, 'BALANCER');
  
  res.json({
    message: `Server ${server.name} is now ${server.healthy ? 'healthy' : 'unhealthy'}`,
    server: {
      name: server.name,
      url: server.url,
      healthy: server.healthy
    }
  });
});

// Create single proxy middleware instance with unified routing
const proxy = createProxyMiddleware(proxyOptions);

// Use single proxy for both API and Socket.IO requests
app.use('/api', proxy);
app.use('/socket.io', proxy); // Handle Socket.IO HTTP requests (polling transport)

// Handle WebSocket upgrades
server.on('upgrade', (request, socket, head) => {
  logger.info(`WebSocket upgrade request received: ${request.url}`, 'BALANCER');
  
  try {
    // Check if we have healthy servers before attempting proxy
    const healthyServers = servers.filter(s => s.healthy).length;
    if (healthyServers === 0) {
      logger.error('No healthy servers available for WebSocket upgrade', 'BALANCER');
      socket.write('HTTP/1.1 503 Service Unavailable\r\n' +
                  'Content-Type: text/plain\r\n' +
                  'Connection: close\r\n' +
                  '\r\n' +
                  'No healthy backend servers available');
      socket.destroy();
      return;
    }
    
    // Use the proxy for WebSocket upgrades
    proxy.upgrade(request, socket, head);
  } catch (error) {
    logger.error(`WebSocket upgrade error: ${error.message}`, 'BALANCER');
    try {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n' +
                  'Content-Type: text/plain\r\n' +
                  'Connection: close\r\n' +
                  '\r\n' +
                  'WebSocket upgrade failed');
      socket.destroy();
    } catch (socketError) {
      logger.error(`Failed to close socket: ${socketError.message}`, 'BALANCER');
    }
  }
});

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, 'BALANCER');
  res.status(500).json({
    error: 'Internal Load Balancer Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// Collect load balancer metrics periodically
const collectLoadBalancerMetrics = () => {
  try {
    const healthyServers = servers.filter(s => s.healthy);
    const unhealthyServers = servers.filter(s => !s.healthy);
    
    const metrics = {
      status: healthyServers.length > 0 ? 'healthy' : 'critical',
      totalServers: servers.length,
      healthyServers: healthyServers.length,
      unhealthyServers: unhealthyServers.length,
      currentIndex: currentServerIndex,
      servers: servers.map(server => ({
        name: server.name,
        url: server.url,
        healthy: server.healthy
      })),
      stickySessions: {
        totalSessions: sessionToServer.size,
        totalClients: clientToServer.size
      },
      uptime: process.uptime() * 1000,
      timestamp: new Date()
    };
    
    telemetryService.updateComponentMetrics('LoadBalancer', metrics);
  } catch (error) {
    logger.warn(`Failed to collect load balancer metrics: ${error.message}`, 'BALANCER');
  }
};

// Start metrics collection
setInterval(collectLoadBalancerMetrics, 2000); // Every 2 seconds

server.listen(PORT, () => {
  logger.success(`Load Balancer running on port ${PORT}`, 'BALANCER');
  logger.info(`Managing ${servers.length} backend servers`, 'BALANCER');
  logger.info('WebSocket support enabled', 'BALANCER');
  logger.info('Starting health checks...', 'BALANCER');
  logger.info('Telemetry metrics collection started', 'BALANCER');
  
  // Collect initial metrics
  setTimeout(collectLoadBalancerMetrics, 1000);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server', 'BALANCER');
  server.close(() => {
    logger.info('HTTP server closed', 'BALANCER');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server', 'BALANCER');
  server.close(() => {
    logger.info('HTTP server closed', 'BALANCER');
    process.exit(0);
  });
});