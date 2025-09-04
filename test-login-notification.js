// Test script to verify login notification real-time delivery
const axios = require('axios');
const io = require('socket.io-client');

const FRONTEND_URL = 'http://localhost:3000';
const BACKEND_URL = 'http://localhost:8000';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testLoginNotification() {
    console.log('🔔 Login Notification Real-Time Test');
    console.log('=====================================\n');
    
    // Generate test user
    const userId = Math.floor(10000 + Math.random() * 90000);
    const username = `test_user_${userId}`;
    const email = 'ramanisahil.cf@gmail.com';
    
    console.log(`📝 Test User Details:`);
    console.log(`   - User ID: ${userId}`);
    console.log(`   - Username: ${username}`);
    console.log(`   - Email: ${email}\n`);
    
    try {
        // Step 1: Connect WebSocket
        console.log('1️⃣ Connecting to WebSocket server...');
        const socket = io(BACKEND_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true
        });
        
        // Set up WebSocket event handlers
        const notificationPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout: No notification received within 10 seconds'));
            }, 10000);
            
            socket.on('connect', () => {
                console.log('✅ WebSocket connected:', socket.id);
                
                // Authenticate the user
                console.log('2️⃣ Authenticating user...');
                socket.emit('authenticate', {
                    userId: userId,
                    username: username,
                    sessionToken: `test-session-${userId}`
                });
            });
            
            socket.on('auth:success', (data) => {
                console.log('✅ Authentication successful:', data);
                console.log('   User is ready to receive notifications\n');
            });
            
            socket.on('auth:error', (error) => {
                console.error('❌ Authentication failed:', error);
                reject(new Error('Authentication failed'));
            });
            
            socket.on('notification:new', (notification) => {
                console.log('🎉 Real-time notification received!');
                console.log('   Type:', notification.type);
                console.log('   Title:', notification.title);
                console.log('   Message:', notification.message);
                console.log('   Priority:', notification.priority);
                console.log('   Timestamp:', notification.timestamp);
                clearTimeout(timeout);
                resolve(notification);
            });
            
            socket.on('disconnect', (reason) => {
                console.log('WebSocket disconnected:', reason);
            });
            
            socket.on('error', (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            });
        });
        
        // Wait for connection and authentication
        await sleep(2000);
        
        // Step 3: Send login notification via API
        console.log('3️⃣ Sending login notification via API...');
        const loginData = {
            type: 'login',
            userId: userId,
            username: username,
            email: email,
            password: 'TestPass123!',
            ipAddress: '192.168.1.100',
            device: 'Chrome on Windows',
            timestamp: new Date().toISOString()
        };
        
        const response = await axios.post(`${FRONTEND_URL}/api/logins`, loginData);
        
        if (response.status === 200 || response.status === 201) {
            console.log('✅ Login API call successful');
            console.log('   Waiting for real-time notification...\n');
        }
        
        // Step 4: Wait for notification
        const notification = await notificationPromise;
        
        console.log('\n========================================');
        console.log('✅ TEST PASSED!');
        console.log('Real-time notification delivery is working');
        console.log('========================================');
        
        // Clean up
        socket.disconnect();
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        process.exit(1);
    }
}

// Run the test
testLoginNotification();