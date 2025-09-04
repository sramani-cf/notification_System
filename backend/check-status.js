const axios = require('axios');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

const log = (message, color = 'reset') => {
  console.log(`${colors[color]}${message}${colors.reset}`);
};

const checkLoadBalancer = async () => {
  try {
    const response = await axios.get('http://localhost:8000/balancer/status', { timeout: 2000 });
    const data = response.data;
    
    log('\\n=== LOAD BALANCER STATUS ===', 'cyan');
    log(`Status: ${data.loadBalancer}`, 'green');
    log(`Port: ${data.port}`, 'blue');
    log(`Healthy Servers: ${data.healthyServers}/${data.totalServers}`, 
        data.healthyServers === data.totalServers ? 'green' : 'yellow');
    
    log('\\nServer Details:', 'cyan');
    data.servers.forEach(server => {
      log(`  ${server.name}: ${server.healthy ? '✓ Healthy' : '✗ Unhealthy'} (${server.url})`,
          server.healthy ? 'green' : 'red');
    });
    
    log('\\nSticky Sessions:', 'cyan');
    log(`  Active Sessions: ${data.stickySession.totalSessions}`, 'blue');
    log(`  Client Mappings: ${data.stickySession.totalClients}`, 'blue');
    
    if (data.stickySession.totalSessions > 0) {
      log('\\n  Recent Session Mappings:', 'yellow');
      Object.entries(data.stickySession.sessionMappings).slice(0, 3).forEach(([session, server]) => {
        log(`    ${session.substring(0, 20)}... -> ${server}`, 'blue');
      });
    }
    
    return data;
  } catch (error) {
    log('\\n=== LOAD BALANCER STATUS ===', 'cyan');
    log('Status: Offline or Not Accessible', 'red');
    log(`Error: ${error.message}`, 'red');
    return null;
  }
};

const checkServer = async (port, name) => {
  try {
    const response = await axios.get(`http://localhost:${port}/api/health`, { timeout: 2000 });
    const data = response.data;
    
    log(`\\n${name} (Port ${port}):`, 'cyan');
    log(`  Status: ${data.status}`, data.status === 'healthy' ? 'green' : 'red');
    log(`  Uptime: ${Math.floor(data.uptime / 60)} minutes`, 'blue');
    
    if (data.database) {
      log(`  Database: ${data.database.status}`, data.database.status === 'connected' ? 'green' : 'red');
    }
    
    if (data.redis) {
      log(`  Redis: ${data.redis.status}`, data.redis.status === 'connected' ? 'green' : 'red');
    }
    
    if (data.email) {
      log(`  Email: ${data.email.status}`, data.email.ready ? 'green' : 'yellow');
    }
    
    if (data.workers) {
      log(`  Workers:`, 'blue');
      Object.entries(data.workers).forEach(([worker, status]) => {
        log(`    ${worker}: ${status}`, status === 'running' ? 'green' : 'red');
      });
    }
    
    return data;
  } catch (error) {
    log(`\\n${name} (Port ${port}):`, 'cyan');
    log(`  Status: Offline or Not Accessible`, 'red');
    log(`  Error: ${error.message}`, 'red');
    return null;
  }
};

const main = async () => {
  log('=== NOTIFICATION SYSTEM STATUS CHECK ===', 'magenta');
  log(`Timestamp: ${new Date().toISOString()}`, 'blue');
  
  // Check load balancer
  const balancerStatus = await checkLoadBalancer();
  
  // Check individual servers
  log('\\n=== INDIVIDUAL SERVER STATUS ===', 'magenta');
  const server1 = await checkServer(5001, 'SERVER-1');
  const server2 = await checkServer(5002, 'SERVER-2');
  const server3 = await checkServer(5003, 'SERVER-3');
  
  // Summary
  log('\\n=== SUMMARY ===', 'magenta');
  
  const allServersHealthy = balancerStatus && 
                           balancerStatus.healthyServers === balancerStatus.totalServers;
  
  if (allServersHealthy) {
    log('✓ All systems operational', 'green');
    log('✓ Load balancer and all servers are healthy', 'green');
    log('✓ WebSocket connections should work properly', 'green');
  } else {
    log('⚠ Some issues detected:', 'yellow');
    
    if (!balancerStatus) {
      log('  - Load balancer is not running', 'red');
    } else if (balancerStatus.healthyServers < balancerStatus.totalServers) {
      log(`  - Only ${balancerStatus.healthyServers}/${balancerStatus.totalServers} servers are healthy`, 'yellow');
    }
    
    if (!server1) log('  - Server 1 is not accessible', 'red');
    if (!server2) log('  - Server 2 is not accessible', 'red');
    if (!server3) log('  - Server 3 is not accessible', 'red');
    
    log('\\nRecommended actions:', 'cyan');
    log('  1. Check if all services are running: npm run dev', 'blue');
    log('  2. Check MongoDB connection', 'blue');
    log('  3. Check Redis connection', 'blue');
    log('  4. Review server logs for errors', 'blue');
  }
  
  log('\\n=== STATUS CHECK COMPLETE ===\\n', 'magenta');
};

main().catch(error => {
  console.error('Status check failed:', error);
  process.exit(1);
});