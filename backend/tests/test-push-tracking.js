/**
 * Test script for push notification tracking
 * Run this after starting the backend services
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:8000/api';

// Test data
const testPurchase = {
  userId: 12345,
  orderId: `ORDER-${Date.now()}`,
  amount: 299.99,
  currency: 'USD',
  items: [
    {
      name: 'Test Product',
      quantity: 1,
      price: 299.99,
      sku: 'TEST-SKU-001',
      category: 'Electronics'
    }
  ],
  paymentMethod: 'credit_card',
  paymentStatus: 'completed',
  orderStatus: 'confirmed',
  shippingAddress: {
    street: '123 Test St',
    city: 'Test City',
    state: 'TS',
    country: 'USA',
    zipCode: '12345'
  },
  totalAmount: 299.99,
  customerName: 'Test User',
  customerEmail: 'test@example.com'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPushNotificationTracking() {
  console.log('🚀 Starting Push Notification Tracking Test\n');
  console.log('=====================================\n');

  try {
    // Step 1: Create a purchase (this should trigger push notification)
    console.log('Step 1: Creating purchase...');
    const purchaseResponse = await axios.post(`${API_BASE_URL}/purchases`, testPurchase);
    
    if (purchaseResponse.data.success) {
      console.log('✅ Purchase created successfully');
      console.log(`   Order ID: ${purchaseResponse.data.data.orderId}`);
      console.log(`   Purchase ID: ${purchaseResponse.data.data._id}`);
      
      const purchaseId = purchaseResponse.data.data._id;
      
      // Wait for notification to be processed
      console.log('\nStep 2: Waiting for push notification to be queued...');
      await sleep(2000);
      
      // Step 3: Check push notification status via purchase
      console.log('\nStep 3: Checking push notification status...');
      try {
        const statusResponse = await axios.get(
          `${API_BASE_URL}/push-notifications/purchase/${purchaseId}/status`
        );
        
        if (statusResponse.data.success) {
          const notificationData = statusResponse.data.data;
          console.log('✅ Push notification found for purchase');
          console.log(`   Notification ID: ${notificationData.notificationId}`);
          console.log(`   Type: ${notificationData.type}`);
          console.log(`   Status: ${notificationData.status}`);
          console.log(`   Priority: ${notificationData.priority}`);
          console.log(`   Queue: ${notificationData.queueName}`);
          console.log(`   Attempts: ${notificationData.attempts}`);
          
          if (notificationData.deliveryStatus) {
            console.log('\n   Delivery Status:');
            console.log(`     - Sent: ${notificationData.deliveryStatus.sent}`);
            console.log(`     - Delivered: ${notificationData.deliveryStatus.delivered}`);
            console.log(`     - Failed: ${notificationData.deliveryStatus.failed}`);
            console.log(`     - Clicked: ${notificationData.deliveryStatus.clicked}`);
          }
          
          if (notificationData.timestamps) {
            console.log('\n   Timestamps:');
            if (notificationData.timestamps.sentAt) {
              console.log(`     - Sent at: ${new Date(notificationData.timestamps.sentAt).toLocaleString()}`);
            }
            if (notificationData.timestamps.deliveredAt) {
              console.log(`     - Delivered at: ${new Date(notificationData.timestamps.deliveredAt).toLocaleString()}`);
            }
            if (notificationData.timestamps.failedAt) {
              console.log(`     - Failed at: ${new Date(notificationData.timestamps.failedAt).toLocaleString()}`);
            }
          }
          
          if (notificationData.failureReason) {
            console.log(`\n   ⚠️ Failure Reason: ${notificationData.failureReason}`);
          }
          
          // Step 4: Check purchase record for push notification reference
          console.log('\nStep 4: Verifying purchase record...');
          const purchaseCheckResponse = await axios.get(`${API_BASE_URL}/purchases/${purchaseId}`);
          
          if (purchaseCheckResponse.data.success) {
            const purchase = purchaseCheckResponse.data.data;
            if (purchase.notifications) {
              console.log('✅ Purchase has notification tracking:');
              if (purchase.notifications.pushNotificationId) {
                console.log(`   Push Notification ID: ${purchase.notifications.pushNotificationId}`);
              }
              if (purchase.notifications.pushDeliveryStatus) {
                console.log(`   Push Delivery Status: ${purchase.notifications.pushDeliveryStatus}`);
              }
              if (purchase.notifications.pushDeliveredAt) {
                console.log(`   Push Delivered At: ${new Date(purchase.notifications.pushDeliveredAt).toLocaleString()}`);
              }
              if (purchase.notifications.pushFailureReason) {
                console.log(`   Push Failure Reason: ${purchase.notifications.pushFailureReason}`);
              }
            } else {
              console.log('⚠️ Purchase does not have notification tracking fields');
            }
          }
          
          // Step 5: Get notification details directly
          if (notificationData.notificationId) {
            console.log('\nStep 5: Getting detailed notification info...');
            const notificationDetailResponse = await axios.get(
              `${API_BASE_URL}/push-notifications/${notificationData.notificationId}`
            );
            
            if (notificationDetailResponse.data.success) {
              const notification = notificationDetailResponse.data.data;
              console.log('✅ Retrieved notification details');
              console.log(`   Title: ${notification.title}`);
              console.log(`   Body: ${notification.body.substring(0, 50)}...`);
              
              if (notification.source) {
                console.log('\n   Source Tracking:');
                console.log(`     - Type: ${notification.source.type}`);
                console.log(`     - Reference Model: ${notification.source.referenceModel}`);
                console.log(`     - Reference ID: ${notification.source.referenceId}`);
                
                // Verify the reference matches our purchase
                if (notification.source.referenceId === purchaseId) {
                  console.log('   ✅ Source reference correctly links to purchase');
                } else {
                  console.log('   ❌ Source reference does not match purchase ID');
                }
              }
            }
          }
          
        } else {
          console.log('⚠️ No push notification found for this purchase');
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          console.log('❌ No push notification found for this purchase');
          console.log('   This could mean:');
          console.log('   - Push notifications are disabled');
          console.log('   - Firebase is not configured');
          console.log('   - The notification service failed to create the notification');
        } else {
          throw error;
        }
      }
      
      // Step 6: Test statistics endpoint
      console.log('\nStep 6: Checking push notification statistics...');
      const statsResponse = await axios.get(`${API_BASE_URL}/push-notifications/statistics`);
      
      if (statsResponse.data.success) {
        const stats = statsResponse.data.data;
        console.log('✅ Push notification statistics:');
        
        if (stats.notifications) {
          console.log('\n   Notification Stats:');
          console.log(`     - Today: ${JSON.stringify(stats.notifications.today || {})}`);
          console.log(`     - Total: ${JSON.stringify(stats.notifications.total || {})}`);
          console.log(`     - Delivery Rate: ${stats.notifications.deliveryRate || '0%'}`);
          console.log(`     - Click Rate: ${stats.notifications.clickRate || '0%'}`);
          console.log(`     - Failure Rate: ${stats.notifications.failureRate || '0%'}`);
        }
      }
      
      console.log('\n=====================================');
      console.log('✅ Push Notification Tracking Test Complete!');
      console.log('=====================================\n');
      
    } else {
      console.log('❌ Failed to create purchase');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    } else {
      console.error('   Message:', error.message);
    }
    console.log('\n=====================================');
    console.log('❌ Push Notification Tracking Test Failed');
    console.log('=====================================\n');
  }
}

// Run the test
console.log('Push Notification Tracking Test');
console.log('================================\n');
console.log('Prerequisites:');
console.log('1. Backend services running on port 5000');
console.log('2. MongoDB connected');
console.log('3. Redis running');
console.log('4. Firebase configured (optional)\n');

testPushNotificationTracking().catch(console.error);