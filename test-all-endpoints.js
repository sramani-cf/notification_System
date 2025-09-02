const testEndpoints = async () => {
  const BASE_URL = 'http://localhost:8000';
  
  console.log('Testing all backend endpoints...\n');
  console.log('=' .repeat(60));
  
  // Test data for each endpoint
  const tests = [
    {
      name: 'Signup',
      endpoint: '/api/signups',
      data: {
        userId: Math.floor(Math.random() * 100000),
        username: 'testuser_' + Math.random().toString(36).substring(7),
        email: `test_${Date.now()}@example.com`,
        password: 'SecurePass123!'
      }
    },
    {
      name: 'Login',
      endpoint: '/api/logins',
      data: {
        userId: Math.floor(Math.random() * 100000),
        username: 'loginuser_' + Math.random().toString(36).substring(7),
        email: `login_${Date.now()}@example.com`,
        password: 'UserPass123!',
        ipAddress: '192.168.1.100',
        device: 'Chrome/Windows'
      }
    },
    {
      name: 'Reset Password',
      endpoint: '/api/reset-passwords',
      data: {
        userId: Math.floor(Math.random() * 100000),
        email: `reset_${Date.now()}@example.com`,
        resetToken: 'rst_' + Math.random().toString(36).substring(7),
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      }
    },
    {
      name: 'Purchase',
      endpoint: '/api/purchases',
      data: {
        userId: Math.floor(Math.random() * 100000),
        orderId: 'ORD_' + Date.now(),
        amount: 99.99,
        currency: 'USD',
        totalAmount: 99.98,  // 2 * 49.99
        items: [
          {
            name: 'Product 1',
            quantity: 2,
            price: 49.99
          }
        ]
      }
    },
    {
      name: 'Friend Request',
      endpoint: '/api/friend-requests',
      data: {
        fromUserId: Math.floor(Math.random() * 100000),
        toUserId: Math.floor(Math.random() * 100000),
        fromUsername: 'sender_' + Math.random().toString(36).substring(7),
        toUsername: 'receiver_' + Math.random().toString(36).substring(7),
        message: 'Let\'s connect!'
      }
    }
  ];
  
  // Test each endpoint
  for (const test of tests) {
    try {
      console.log(`\nTesting ${test.name} endpoint: ${test.endpoint}`);
      console.log('Request data:', JSON.stringify(test.data, null, 2));
      
      const response = await fetch(BASE_URL + test.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3001' // Simulate frontend origin
        },
        body: JSON.stringify(test.data)
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        console.log(`✅ ${test.name} successful!`);
        console.log(`   ID: ${result.data._id}`);
        console.log(`   Server: ${result.server}`);
        console.log(`   Message: ${result.message}`);
      } else {
        console.log(`❌ ${test.name} failed:`, result.error || result.message);
      }
    } catch (error) {
      console.log(`❌ ${test.name} error:`, error.message);
    }
    console.log('-'.repeat(60));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('All tests completed!');
  console.log('\nData is stored in MongoDB collections:');
  console.log('   - signups');
  console.log('   - logins');
  console.log('   - resetpasswords');
  console.log('   - purchases');
  console.log('   - friendrequests');
};

// Run the tests
testEndpoints().catch(console.error);