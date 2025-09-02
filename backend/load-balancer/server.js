require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const logger = require('../utils/logger');

const app = express();
const PORT = process.env.LOAD_BALANCER_PORT || 8000;

logger.setServerName('BALANCER');

const servers = [
  { url: `http://localhost:${process.env.SERVER1_PORT || 5001}`, name: 'SERVER-1', healthy: true },
  { url: `http://localhost:${process.env.SERVER2_PORT || 5002}`, name: 'SERVER-2', healthy: true },
  { url: `http://localhost:${process.env.SERVER3_PORT || 5003}`, name: 'SERVER-3', healthy: true }
];

let currentServerIndex = 0;

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
  for (const server of servers) {
    try {
      const response = await axios.get(`${server.url}/api/health`, {
        timeout: 5000
      });
      
      if (response.status === 200) {
        if (!server.healthy) {
          logger.success(`${server.name} is back online`, 'BALANCER');
        }
        server.healthy = true;
      }
    } catch (error) {
      if (server.healthy) {
        logger.error(`${server.name} health check failed: ${error.message}`, 'BALANCER');
      }
      server.healthy = false;
    }
  }
};

setInterval(healthCheck, 10000);

setTimeout(healthCheck, 2000);

// Parse JSON bodies before proxying
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const proxyOptions = {
  changeOrigin: true,
  logLevel: 'silent',
  router: (req) => {
    const server = getNextHealthyServer();
    if (!server) {
      throw new Error('No healthy servers available');
    }
    return server.url;
  },
  onError: (err, req, res) => {
    logger.error(`Proxy error: ${err.message}`, 'BALANCER');
    
    if (!res.headersSent) {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'All backend servers are currently down. Please try again later.',
        timestamp: new Date().toISOString()
      });
    }
  },
  onProxyReq: (proxyReq, req, res) => {
    const server = getNextHealthyServer();
    if (server) {
      proxyReq.setHeader('X-Forwarded-Server', server.name);
      proxyReq.setHeader('X-Load-Balancer', 'Active');
      
      // Fix body parsing for POST/PUT/PATCH requests
      if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    const serverHeader = proxyRes.headers['x-server-info'];
    if (serverHeader) {
      logger.info(`Response from ${serverHeader}`, 'BALANCER');
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

app.use('/api', createProxyMiddleware(proxyOptions));

app.use('/', createProxyMiddleware(proxyOptions));

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, 'BALANCER');
  res.status(500).json({
    error: 'Internal Load Balancer Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

const server = app.listen(PORT, () => {
  logger.success(`Load Balancer running on port ${PORT}`, 'BALANCER');
  logger.info(`Managing ${servers.length} backend servers`, 'BALANCER');
  logger.info('Starting health checks...', 'BALANCER');
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