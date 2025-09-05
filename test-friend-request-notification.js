const axios = require('axios');

const BASE_URL = 'http://localhost:8000';

async function testFriendRequestNotification() {
  console.log('🚀 Testing Friend Request In-App Notification Flow (After Fixes)...\n');
  
  try {
    // Test data for friend request
    const friendRequestData = {
      fromUserId: 1234,
      fromUsername: 'testuser123',
      toUserId: 5678,
      toUsername: 'targetuser456',
      message: 'Hey! Let\'s connect on this platform!',
      mutualFriendsCount: 3,
      relationshipType: 'friend'
    };

    console.log('📝 Sending friend request with data:');
    console.log(JSON.stringify(friendRequestData, null, 2));
    console.log('');

    // Send POST request to create friend request
    const response = await axios.post(`${BASE_URL}/api/friend-requests`, friendRequestData, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 201) {
      console.log('✅ Friend request created successfully!');
      console.log('📊 Response data:');
      console.log(`   - ID: ${response.data.data._id}`);
      console.log(`   - From: ${response.data.data.fromUsername}`);
      console.log(`   - To: ${response.data.data.toUsername}`);
      console.log(`   - Status: ${response.data.data.requestStatus}`);
      console.log(`   - Server: ${response.data.server}`);
      console.log('');

      // Check notification tracking
      if (response.data.data.friendRequestInAppNotification) {
        const notification = response.data.data.friendRequestInAppNotification;
        console.log('🔔 In-App Notification Tracking:');
        console.log(`   - Status: ${notification.status}`);
        console.log(`   - Attempts: ${notification.attempts}`);
        console.log(`   - Job ID: ${notification.queueJobId || 'N/A'}`);
        console.log(`   - Notification ID: ${notification.notificationId || 'N/A'}`);
        console.log(`   - History entries: ${notification.deliveryHistory?.length || 0}`);
      } else {
        console.log('⚠️  No notification tracking data found');
      }

      // Wait a moment for notification processing
      console.log('\n⏳ Waiting 3 seconds for notification processing...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Fetch the friend request again to check updated status
      console.log('\n🔍 Checking notification status after processing...');
      const checkResponse = await axios.get(`${BASE_URL}/api/friend-requests/${response.data.data._id}`);
      
      if (checkResponse.data.success) {
        const updatedNotification = checkResponse.data.data.friendRequestInAppNotification;
        console.log('🔔 Updated In-App Notification Status:');
        console.log(`   - Status: ${updatedNotification.status}`);
        console.log(`   - Attempts: ${updatedNotification.attempts}`);
        console.log(`   - Delivered At: ${updatedNotification.deliveredAt || 'N/A'}`);
        console.log(`   - Failed At: ${updatedNotification.failedAt || 'N/A'}`);
        console.log(`   - Socket ID: ${updatedNotification.socketId || 'N/A'}`);
        console.log(`   - Delivered Via: ${updatedNotification.deliveredVia || 'N/A'}`);
        console.log(`   - Failure Reason: ${updatedNotification.failureReason || 'N/A'}`);
        console.log(`   - History entries: ${updatedNotification.deliveryHistory?.length || 0}`);

        if (updatedNotification.deliveryHistory && updatedNotification.deliveryHistory.length > 0) {
          console.log('\n📋 Delivery History:');
          updatedNotification.deliveryHistory.forEach((entry, index) => {
            console.log(`   ${index + 1}. ${entry.status} at ${entry.timestamp} (Queue: ${entry.queueName})`);
            if (entry.error) console.log(`      Error: ${entry.error}`);
          });
        }

        // Determine success
        if (updatedNotification.status === 'delivered') {
          console.log('\n🎉 SUCCESS: Friend request in-app notification delivered successfully!');
        } else if (updatedNotification.status === 'failed') {
          console.log('\n❌ FAILED: Friend request in-app notification failed to deliver');
          console.log(`   Reason: ${updatedNotification.failureReason}`);
        } else {
          console.log(`\n⏳ IN PROGRESS: Notification status is '${updatedNotification.status}'`);
        }
      }

    } else {
      console.log('❌ Failed to create friend request');
      console.log('Response:', response.data);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Connection refused - make sure the backend server is running on port 8000');
    }
  }
}

// Run the test
testFriendRequestNotification().then(() => {
  console.log('\n🏁 Test completed');
}).catch((error) => {
  console.error('💥 Unexpected error:', error.message);
  process.exit(1);
});