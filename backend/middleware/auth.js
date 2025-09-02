const logger = require('../utils/logger');

const attachServerInfo = (req, res, next) => {
  req.serverInfo = req.serverInfo || 'Unknown';
  req.serverPort = req.serverPort || 'Unknown';
  res.setHeader('X-Server-Info', req.serverInfo);
  res.setHeader('X-Server-Port', req.serverPort);
  next();
};

const logRequest = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.request(req.method, req.originalUrl, req.serverInfo, res.statusCode);
    
    if (duration > 1000) {
      logger.warn(`Slow request: ${req.method} ${req.originalUrl} took ${duration}ms`, req.serverInfo);
    }
  });
  
  next();
};

const rateLimiter = (() => {
  const requests = new Map();
  const windowMs = 60 * 1000;
  const maxRequests = 100;
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!requests.has(ip)) {
      requests.set(ip, []);
    }
    
    const userRequests = requests.get(ip).filter(timestamp => now - timestamp < windowMs);
    
    if (userRequests.length >= maxRequests) {
      logger.warn(`Rate limit exceeded for IP: ${ip}`, req.serverInfo);
      return res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later',
        server: req.serverInfo
      });
    }
    
    userRequests.push(now);
    requests.set(ip, userRequests);
    
    next();
  };
})();

const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key].trim();
        obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };
  
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  if (req.params) sanitize(req.params);
  
  next();
};

module.exports = {
  attachServerInfo,
  logRequest,
  rateLimiter,
  sanitizeInput
};