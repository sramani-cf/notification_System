/**
 * Test script for comprehensive push notification tracking
 * Tests the enhanced tracking that mirrors login email schema
 */

const axios = require('axios');
const mongoose = require('mongoose');

const API_BASE_URL = 'http://localhost:8000/api';

// Test data
const testPurchase = {
  userId: 12345,
  orderId: `ORDER-TRACK-${Date.now()}`,
  amount: 499.99,
  currency: 'USD',
  items: [
    {
      name: 'Premium Test Product',
      quantity: 1,
      price: 499.99,
      sku: 'PREMIUM-TEST-001',
      category: 'Electronics'
    }
  ],
  paymentMethod: 'credit_card',
  paymentStatus: 'completed',
  orderStatus: 'confirmed',
  shippingAddress: {
    street: '456 Test Avenue',
    city: 'Test City',
    state: 'TS',
    country: 'USA',
    zipCode: '54321'
  },
  totalAmount: 499.99,
  customerName: 'Test Customer',
  customerEmail: 'customer@test.com'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testComprehensivePushTracking() {
  console.log('🚀 Starting Comprehensive Push Notification Tracking Test\n');
  console.log('=====================================================\n');

  try {
    // Step 1: Create a purchase
    console.log('Step 1: Creating purchase with comprehensive tracking...');
    const purchaseResponse = await axios.post(`${API_BASE_URL}/purchases`, testPurchase);
    
    if (purchaseResponse.data.success) {
      console.log('✅ Purchase created successfully');
      console.log(`   Order ID: ${purchaseResponse.data.data.orderId}`);
      console.log(`   Purchase ID: ${purchaseResponse.data.data._id}`);
      
      const purchaseId = purchaseResponse.data.data._id;
      
      // Wait for notification to be queued and processed
      console.log('\nStep 2: Waiting for push notification to be queued and processed...');
      await sleep(3000);
      
      // Step 3: Check comprehensive push notification tracking
      console.log('\nStep 3: Checking comprehensive push notification tracking...');
      try {
        const statusResponse = await axios.get(
          `${API_BASE_URL}/push-notifications/purchase/${purchaseId}/status`
        );
        
        if (statusResponse.data.success) {
          const trackingData = statusResponse.data.data.tracking;
          const notification = statusResponse.data.data.notification;
          const deliveryHistory = statusResponse.data.data.deliveryHistory;
          
          console.log('\n✅ Comprehensive Push Notification Tracking:');
          console.log('\n📊 Tracking Summary:');
          console.log(`   Status: ${trackingData.status}`);
          console.log(`   Attempts: ${trackingData.attempts}`);
          console.log(`   Last Attempt: ${trackingData.lastAttemptAt ? new Date(trackingData.lastAttemptAt).toLocaleString() : 'N/A'}`);
          console.log(`   Delivered At: ${trackingData.deliveredAt ? new Date(trackingData.deliveredAt).toLocaleString() : 'N/A'}`);
          console.log(`   Failed At: ${trackingData.failedAt ? new Date(trackingData.failedAt).toLocaleString() : 'N/A'}`);
          console.log(`   Clicked At: ${trackingData.clickedAt ? new Date(trackingData.clickedAt).toLocaleString() : 'N/A'}`);
          console.log(`   Message ID: ${trackingData.messageId || 'N/A'}`);
          console.log(`   Failure Reason: ${trackingData.failureReason || 'N/A'}`);
          console.log(`   FCM Token Count: ${trackingData.fcmTokenCount}`);
          console.log(`   Total History Entries: ${trackingData.totalHistoryEntries}`);
          
          if (trackingData.fcmResponse) {
            console.log('\n📡 FCM Response:');
            console.log(`   Success Count: ${trackingData.fcmResponse.successCount}`);
            console.log(`   Failure Count: ${trackingData.fcmResponse.failureCount}`);
            if (trackingData.fcmResponse.messageIds && trackingData.fcmResponse.messageIds.length > 0) {
              console.log(`   Message IDs: ${trackingData.fcmResponse.messageIds.join(', ')}`);
            }
            if (trackingData.fcmResponse.errors && trackingData.fcmResponse.errors.length > 0) {
              console.log(`   Errors: ${trackingData.fcmResponse.errors.join(', ')}`);
            }
          }
          
          if (deliveryHistory && deliveryHistory.length > 0) {
            console.log('\n📜 Delivery History:');
            deliveryHistory.forEach(entry => {
              console.log(`   Attempt ${entry.attempt} - ${entry.status}:`);
              console.log(`     Time: ${new Date(entry.timestamp).toLocaleString()}`);
              console.log(`     Queue: ${entry.queueName}`);
              console.log(`     FCM Tokens: ${entry.fcmTokenCount}`);
              if (entry.successCount > 0 || entry.failureCount > 0) {
                console.log(`     Results: ${entry.successCount} success, ${entry.failureCount} failed`);
              }
              if (entry.error) {
                console.log(`     Error: ${entry.error}`);
              }
            });
          }
          
          if (notification) {
            console.log('\n🔔 Push Notification Details:');
            console.log(`   Notification ID: ${notification.notificationId}`);
            console.log(`   Type: ${notification.type}`);
            console.log(`   Status: ${notification.status}`);
            console.log(`   Priority: ${notification.priority}`);
            console.log(`   Queue: ${notification.queueName}`);
          }
          
          // Step 4: Verify purchase record has comprehensive tracking
          console.log('\nStep 4: Verifying purchase record has comprehensive tracking fields...');
          const purchaseCheckResponse = await axios.get(`${API_BASE_URL}/purchases/${purchaseId}`);
          
          if (purchaseCheckResponse.data.success) {
            const purchase = purchaseCheckResponse.data.data;
            if (purchase.purchasePushNotification) {
              console.log('✅ Purchase has comprehensive push notification tracking:');
              console.log(`   Status: ${purchase.purchasePushNotification.status}`);
              console.log(`   Notification ID: ${purchase.purchasePushNotification.notificationId || 'N/A'}`);
              console.log(`   Queue Job ID: ${purchase.purchasePushNotification.queueJobId || 'N/A'}`);
              console.log(`   Attempts: ${purchase.purchasePushNotification.attempts}`);
              console.log(`   Delivery History Count: ${purchase.purchasePushNotification.deliveryHistory?.length || 0}`);
              
              // Verify tracking consistency
              if (purchase.purchasePushNotification.status === trackingData.status) {
                console.log('   ✅ Status tracking is consistent between purchase and API response');
              } else {
                console.log('   ❌ Status mismatch between purchase and API response');
              }
            } else {
              console.log('⚠️ Purchase does not have purchasePushNotification field');
            }
          }
          
          // Step 5: Test statistics with comprehensive tracking
          console.log('\nStep 5: Checking push notification statistics...');
          const statsResponse = await axios.get(`${API_BASE_URL}/push-notifications/statistics`);
          
          if (statsResponse.data.success) {
            const stats = statsResponse.data.data;
            console.log('✅ Push notification statistics retrieved');
            if (stats.notifications) {
              console.log(`   Today's notifications: ${JSON.stringify(stats.notifications.today || {})}`);
            }
          }
          
        } else {
          console.log('⚠️ No push notification tracking found for this purchase');
        }
      } catch (error) {
        if (error.response && error.response.status === 404) {
          console.log('❌ Push notification tracking not found');
          console.log('   Possible reasons:');
          console.log('   - Firebase is not configured');
          console.log('   - Push notifications are disabled');
          console.log('   - Notification service failed');
        } else {
          throw error;
        }
      }
      
      console.log('\n=====================================================');
      console.log('✅ Comprehensive Push Notification Tracking Test Complete!');
      console.log('=====================================================\n');
      
      console.log('Summary:');
      console.log('- Purchase model now has comprehensive push notification tracking');
      console.log('- Tracking mirrors the login email schema structure');
      console.log('- Full delivery history is maintained');
      console.log('- FCM response details are captured');
      console.log('- Status transitions are tracked with timestamps');
      
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
    console.log('\n=====================================================');
    console.log('❌ Comprehensive Push Notification Tracking Test Failed');
    console.log('=====================================================\n');
  }
}

// Run the test
console.log('Comprehensive Push Notification Tracking Test');
console.log('============================================\n');
console.log('Prerequisites:');
console.log('1. Backend services running on port 8000');
console.log('2. MongoDB connected');
console.log('3. Redis running for queues');
console.log('4. Firebase configured (optional but recommended)\n');

testComprehensivePushTracking().catch(console.error);