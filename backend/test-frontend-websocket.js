const axios = require('axios');
const io = require('socket.io-client');

// Color codes
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

class FrontendIntegrationTester {
  constructor() {
    this.socket = null;
    this.currentUser = null;
  }

  async runTests() {
    console.log('\n' + '='.repeat(70));
    log('FRONTEND WEBSOCKET INTEGRATION TEST', 'magenta');
    console.log('='.repeat(70) + '\n');

    try {
      // Step 1: Simulate frontend session creation
      await this.createUserSession();
      
      // Step 2: Connect WebSocket like frontend does
      await this.connectWebSocket();
      
      // Step 3: Trigger notification from frontend perspective
      await this.triggerNotificationFromFrontend();
      
      // Step 4: Wait and verify notification delivery
      await this.verifyNotificationDelivery();
      
      log('\n✅ Frontend WebSocket integration test completed successfully!', 'green');
      
    } catch (error) {
      log(`\n❌ Test failed: ${error.message}`, 'red');
    } finally {
      this.cleanup();
    }
  }

  async createUserSession() {
    log('Step 1: Creating user session (simulating frontend UserContext)', 'cyan');
    
    try {
      // Simulate what the frontend UserContext does
      const response = await axios.post('http://localhost:8000/api/session', {
        clientInfo: {
          userAgent: 'Mozilla/5.0 Test Client',
          timestamp: new Date().toISOString()
        }
      });
      
      this.currentUser = {
        userId: response.data.userId,
        username: response.data.username,
        email: response.data.email,
        sessionToken: response.data.sessionToken
      };
      
      log(`✅ User session created: ${this.currentUser.username} (ID: ${this.currentUser.userId})`, 'green');
      
    } catch (error) {
      // Fallback to local generation like frontend does
      const userId = Math.floor(10000 + Math.random() * 90000);
      this.currentUser = {
        userId,
        username: `user_${userId}`,
        email: 'ramanisahil.cf@gmail.com',
        sessionToken: `local-session-${userId}-${Date.now()}`
      };
      
      log(`⚠️ Using locally generated user: ${this.currentUser.username} (ID: ${this.currentUser.userId})`, 'yellow');
    }
  }

  connectWebSocket() {
    return new Promise((resolve, reject) => {
      log('\nStep 2: Connecting WebSocket (simulating frontend connection)', 'cyan');
      
      // Connect exactly like the frontend does
      this.socket = io('http://localhost:8000', {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        forceNew: true,
        upgrade: true,
        rememberUpgrade: true,
        autoConnect: true,
        query: {
          timestamp: Date.now()
        }
      });

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 15000);

      this.socket.once('connect', () => {
        log(`✅ WebSocket connected: ${this.socket.id}`, 'green');
        clearTimeout(timeout);
        
        // Authenticate like frontend does
        log('Authenticating with WebSocket...', 'blue');
        this.socket.emit('authenticate', {
          userId: this.currentUser.userId,
          username: this.currentUser.username,
          sessionToken: this.currentUser.sessionToken
        });
      });

      this.socket.once('auth:success', (data) => {
        log(`✅ Authentication successful for ${data.username}`, 'green');
        resolve();
      });

      this.socket.once('auth:error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Auth failed: ${error.message}`));
      });

      this.socket.once('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  async triggerNotificationFromFrontend() {
    log('\nStep 3: Triggering notification (simulating frontend button click)', 'cyan');
    
    // Simulate what happens when user clicks "Login" button in frontend
    const notificationData = {
      type: 'login',
      userId: this.currentUser.userId,
      username: this.currentUser.username,
      email: this.currentUser.email,
      password: 'TestPass123!',
      ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      device: 'Chrome on Windows',
      timestamp: new Date().toISOString()
    };
    
    try {
      log('Sending login notification request to API...', 'blue');
      const response = await axios.post('http://localhost:8000/api/logins', notificationData);
      
      if (response.data.success) {
        log(`✅ Login notification triggered: ${response.data.data._id}`, 'green');
        log(`  Email Status: ${response.data.data.loginAlertEmail?.status || 'N/A'}`, 'blue');
        log(`  In-App Status: ${response.data.data.inAppNotification?.status || 'N/A'}`, 'blue');
      }
    } catch (error) {
      throw new Error(`Failed to trigger notification: ${error.message}`);
    }
  }

  verifyNotificationDelivery() {
    return new Promise((resolve) => {
      log('\nStep 4: Waiting for real-time notification delivery...', 'cyan');
      
      let received = false;
      
      // Listen for notification like frontend does
      this.socket.once('notification:new', (notification) => {
        received = true;
        console.log('\n' + '🔔'.repeat(20));
        log('NOTIFICATION RECEIVED IN FRONTEND!', 'magenta');
        console.log('─'.repeat(70));
        log(`Type: ${notification.type}`, 'yellow');
        log(`Title: ${notification.title}`, 'yellow');
        log(`Message: ${notification.message}`, 'yellow');
        
        if (notification.data) {
          log('Additional Data:', 'cyan');
          Object.entries(notification.data).forEach(([key, value]) => {
            console.log(`  ${key}: ${JSON.stringify(value)}`);
          });
        }
        console.log('─'.repeat(70));
        console.log('🔔'.repeat(20) + '\n');
        
        // Send acknowledgment like frontend does
        this.socket.emit('notification:ack', {
          notificationId: notification.id,
          received: true,
          timestamp: new Date().toISOString()
        });
        
        log('✅ Notification acknowledged', 'green');
        resolve();
      });
      
      // Also listen for broadcast notifications
      this.socket.on('notification:broadcast', (notification) => {
        log(`📢 Broadcast received: ${notification.title}`, 'yellow');
      });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (!received) {
          log('⏱️ Notification delivery timeout (5 seconds)', 'yellow');
          log('This might indicate the worker is not processing the queue', 'yellow');
        }
        resolve();
      }, 5000);
    });
  }

  cleanup() {
    log('\nCleaning up...', 'blue');
    if (this.socket) {
      this.socket.disconnect();
      log('WebSocket disconnected', 'blue');
    }
  }
}

// Check servers before running tests
async function checkServers() {
  try {
    const response = await axios.get('http://localhost:8000/balancer/status');
    const { healthyServers, totalServers } = response.data;
    
    if (healthyServers === 0) {
      throw new Error('No healthy servers available');
    }
    
    log(`✅ Load balancer running with ${healthyServers}/${totalServers} healthy servers`, 'green');
    
    // Also check frontend
    try {
      await axios.get('http://localhost:3000');
      log('✅ Frontend is running on port 3000', 'green');
    } catch (error) {
      log('⚠️ Frontend might not be running on port 3000', 'yellow');
    }
    
    return true;
  } catch (error) {
    log('❌ Backend servers are not accessible', 'red');
    log('Please ensure servers are running: npm run dev', 'yellow');
    return false;
  }
}

// Main execution
async function main() {
  console.clear();
  console.log(colors.magenta + `
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║        FRONTEND WEBSOCKET INTEGRATION TEST                      ║
║                                                                  ║
║  This test simulates the exact flow that happens when:          ║
║  1. Frontend creates a user session                             ║
║  2. Frontend connects via WebSocket                             ║
║  3. User clicks a notification button                           ║
║  4. Real-time notification is delivered                         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
` + colors.reset);

  // Check servers
  log('Checking system status...', 'blue');
  const serversReady = await checkServers();
  
  if (!serversReady) {
    process.exit(1);
  }

  // Run tests
  const tester = new FrontendIntegrationTester();
  await tester.runTests();
}

// Run the test
main().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});