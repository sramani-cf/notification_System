const express = require('express');
const router = express.Router();
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

module.exports = router;