
const io = require('socket.io-client');
const axios = require('axios');

// Colors for console output
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
  console.log(`${colors[color]}[${new Date().toISOString()}] ${message}${colors.reset}`);
};

class WebSocketConnectionTester {
  constructor() {
    this.connections = [];
    this.testResults = {
      firstConnection: false,
      secondConnection: false,
      simultaneousConnections: false,
      reconnection: false,
      authSuccess: false,
      notificationDelivery: false
    };
  }

  async runAllTests() {
    console.log('\n' + '='.repeat(70));
    log('WEBSOCKET CONNECTION COMPREHENSIVE TEST', 'magenta');
    console.log('='.repeat(70) + '\n');

    try {
      // Test 1: First Connection
      await this.testFirstConnection();
      
      // Test 2: Second Connection (Different User)
      await this.testSecondConnection();
      
      // Test 3: Simultaneous Connections
      await this.testSimultaneousConnections();
      
      // Test 4: Reconnection After Disconnect
      await this.testReconnection();
      
      // Test 5: Notification Delivery
      await this.testNotificationDelivery();
      
      // Show Results
      this.showTestResults();
      
    } catch (error) {
      log(`Test suite failed: ${error.message}`, 'red');
    } finally {
      this.cleanup();
    }
  }

  testFirstConnection() {
    return new Promise((resolve, reject) => {
      log('\n📝 TEST 1: First WebSocket Connection', 'cyan');
      log('Creating connection for User 1001...', 'blue');
      
      const socket = io('http://localhost:8000', {
        transports: ['websocket', 'polling'],
        reconnection: false
      });

      const timeout = setTimeout(() => {
        log('❌ Connection timeout', 'red');
        socket.disconnect();
        reject(new Error('First connection timeout'));
      }, 5000);

      socket.on('connect', () => {
        log(`✅ Connected with socket ID: ${socket.id}`, 'green');
        clearTimeout(timeout);
        
        // Authenticate
        socket.emit('authenticate', {
          userId: 1001,
          username: 'test_user_1001',
          sessionToken: 'test-token-1001'
        });
      });

      socket.on('auth:success', (data) => {
        log(`✅ Authentication successful for ${data.username}`, 'green');
        this.testResults.firstConnection = true;
        this.testResults.authSuccess = true;
        this.connections.push({ socket, userId: 1001 });
        resolve();
      });

      socket.on('auth:error', (error) => {
        log(`❌ Authentication failed: ${error.message}`, 'red');
        clearTimeout(timeout);
        reject(new Error('Authentication failed'));
      });

      socket.on('connect_error', (error) => {
        log(`❌ Connection error: ${error.message}`, 'red');
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  testSecondConnection() {
    return new Promise((resolve, reject) => {
      log('\n📝 TEST 2: Second WebSocket Connection (Different User)', 'cyan');
      log('Creating connection for User 1002...', 'blue');
      
      const socket = io('http://localhost:8000', {
        transports: ['websocket', 'polling'],
        reconnection: false
      });

      const timeout = setTimeout(() => {
        log('❌ Connection timeout', 'red');
        socket.disconnect();
        reject(new Error('Second connection timeout'));
      }, 5000);

      socket.on('connect', () => {
        log(`✅ Connected with socket ID: ${socket.id}`, 'green');
        clearTimeout(timeout);
        
        // Authenticate as different user
        socket.emit('authenticate', {
          userId: 1002,
          username: 'test_user_1002',
          sessionToken: 'test-token-1002'
        });
      });

      socket.on('auth:success', (data) => {
        log(`✅ Authentication successful for ${data.username}`, 'green');
        this.testResults.secondConnection = true;
        this.connections.push({ socket, userId: 1002 });
        
        // Check if first connection is still active
        if (this.connections[0] && this.connections[0].socket.connected) {
          log('✅ First connection still active', 'green');
        }
        
        resolve();
      });

      socket.on('auth:error', (error) => {
        log(`❌ Authentication failed: ${error.message}`, 'red');
        clearTimeout(timeout);
        reject(new Error('Authentication failed'));
      });

      socket.on('connect_error', (error) => {
        log(`❌ Connection error: ${error.message}`, 'red');
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async testSimultaneousConnections() {
    log('\n📝 TEST 3: Simultaneous Connections', 'cyan');
    log('Creating 5 simultaneous connections...', 'blue');
    
    const promises = [];
    for (let i = 3001; i <= 3005; i++) {
      promises.push(this.createConnection(i));
    }
    
    try {
      const results = await Promise.all(promises);
      const successCount = results.filter(r => r).length;
      log(`✅ Successfully created ${successCount}/5 simultaneous connections`, 'green');
      this.testResults.simultaneousConnections = successCount === 5;
    } catch (error) {
      log(`❌ Simultaneous connections failed: ${error.message}`, 'red');
    }
  }

  createConnection(userId) {
    return new Promise((resolve) => {
      const socket = io('http://localhost:8000', {
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 3000
      });

      const timeout = setTimeout(() => {
        socket.disconnect();
        resolve(false);
      }, 3000);

      socket.on('connect', () => {
        socket.emit('authenticate', {
          userId: userId,
          username: `test_user_${userId}`,
          sessionToken: `test-token-${userId}`
        });
      });

      socket.on('auth:success', () => {
        clearTimeout(timeout);
        log(`  ✓ User ${userId} connected`, 'green');
        this.connections.push({ socket, userId });
        resolve(true);
      });

      socket.on('connect_error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  async testReconnection() {
    log('\n📝 TEST 4: Reconnection After Disconnect', 'cyan');
    
    // Use the first connection
    if (!this.connections[0]) {
      log('❌ No connection available for reconnection test', 'red');
      return;
    }

    const { socket: oldSocket, userId } = this.connections[0];
    
    // Disconnect
    log('Disconnecting User 1001...', 'blue');
    oldSocket.disconnect();
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Reconnect
    log('Attempting to reconnect User 1001...', 'blue');
    
    const newSocket = io('http://localhost:8000', {
      transports: ['websocket', 'polling'],
      reconnection: false
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        log('❌ Reconnection timeout', 'red');
        newSocket.disconnect();
        resolve();
      }, 5000);

      newSocket.on('connect', () => {
        log(`✅ Reconnected with new socket ID: ${newSocket.id}`, 'green');
        
        newSocket.emit('authenticate', {
          userId: userId,
          username: `test_user_${userId}`,
          sessionToken: `test-token-${userId}`
        });
      });

      newSocket.on('auth:success', () => {
        log('✅ Re-authentication successful', 'green');
        clearTimeout(timeout);
        this.testResults.reconnection = true;
        this.connections[0] = { socket: newSocket, userId };
        resolve();
      });

      newSocket.on('connect_error', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async testNotificationDelivery() {
    log('\n📝 TEST 5: Notification Delivery via WebSocket', 'cyan');
    
    if (!this.connections[0] || !this.connections[0].socket.connected) {
      log('❌ No active connection for notification test', 'red');
      return;
    }

    const { socket, userId } = this.connections[0];
    
    return new Promise(async (resolve) => {
      // Listen for notification
      socket.once('notification:new', (notification) => {
        log('🔔 Notification received!', 'magenta');
        log(`  Type: ${notification.type}`, 'blue');
        log(`  Title: ${notification.title}`, 'blue');
        log(`  Message: ${notification.message}`, 'blue');
        this.testResults.notificationDelivery = true;
        resolve();
      });

      // Trigger a notification
      log(`Triggering login notification for User ${userId}...`, 'blue');
      
      try {
        const response = await axios.post('http://localhost:8000/api/logins', {
          type: 'login',
          userId: userId,
          username: `test_user_${userId}`,
          email: 'test@example.com',
          password: 'test123',
          ipAddress: '127.0.0.1',
          device: 'Test Client',
          timestamp: new Date().toISOString()
        });
        
        log(`✅ Login created: ${response.data.data._id}`, 'green');
        
        // Wait for notification
        setTimeout(() => {
          if (!this.testResults.notificationDelivery) {
            log('⏱️ Notification timeout', 'yellow');
          }
          resolve();
        }, 5000);
        
      } catch (error) {
        log(`❌ Failed to trigger notification: ${error.message}`, 'red');
        resolve();
      }
    });
  }

  showTestResults() {
    console.log('\n' + '='.repeat(70));
    log('TEST RESULTS SUMMARY', 'magenta');
    console.log('='.repeat(70));
    
    const results = [
      { name: 'First Connection', key: 'firstConnection' },
      { name: 'Authentication', key: 'authSuccess' },
      { name: 'Second Connection', key: 'secondConnection' },
      { name: 'Simultaneous Connections', key: 'simultaneousConnections' },
      { name: 'Reconnection', key: 'reconnection' },
      { name: 'Notification Delivery', key: 'notificationDelivery' }
    ];
    
    let passedCount = 0;
    results.forEach(({ name, key }) => {
      const passed = this.testResults[key];
      if (passed) passedCount++;
      log(`${passed ? '✅' : '❌'} ${name}`, passed ? 'green' : 'red');
    });
    
    console.log('─'.repeat(70));
    const allPassed = passedCount === results.length;
    log(`Overall: ${passedCount}/${results.length} tests passed`, allPassed ? 'green' : 'yellow');
    
    if (!allPassed) {
      console.log('\n' + colors.yellow + 'Issues Detected:' + colors.reset);
      if (!this.testResults.secondConnection) {
        console.log('  - Second connection failing (backend might be disconnecting previous connections)');
      }
      if (!this.testResults.simultaneousConnections) {
        console.log('  - Multiple simultaneous connections not working properly');
      }
      if (!this.testResults.reconnection) {
        console.log('  - Reconnection after disconnect is failing');
      }
      if (!this.testResults.notificationDelivery) {
        console.log('  - Real-time notification delivery not working');
      }
    }
    
    console.log('='.repeat(70) + '\n');
  }

  cleanup() {
    log('Cleaning up connections...', 'blue');
    this.connections.forEach(({ socket }) => {
      if (socket.connected) {
        socket.disconnect();
      }
    });
    this.connections = [];
  }
}

// Check if servers are running
async function checkServers() {
  try {
    const response = await axios.get('http://localhost:8000/balancer/status');
    const { healthyServers, totalServers } = response.data;
    
    if (healthyServers === 0) {
      throw new Error('No healthy servers available');
    }
    
    log(`✅ Load balancer running with ${healthyServers}/${totalServers} healthy servers`, 'green');
    return true;
  } catch (error) {
    log('❌ Load balancer is not accessible', 'red');
    log('Please ensure servers are running: npm run dev', 'yellow');
    return false;
  }
}

// Main execution
async function main() {
  console.clear();
  
  // Check servers
  log('Checking server status...', 'blue');
  const serversReady = await checkServers();
  
  if (!serversReady) {
    process.exit(1);
  }

  // Run tests
  const tester = new WebSocketConnectionTester();
  await tester.runAllTests();
}

// Run the test
main().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});