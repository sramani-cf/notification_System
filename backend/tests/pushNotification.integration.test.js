const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app'); // Assuming you have an app.js
const PushNotification = require('../models/pushNotification.model');
const FcmToken = require('../models/fcmToken.model');
const User = require('../models/user.model');
const queueManager = require('../queues');

let mongoServer;
let testUser;
let authToken;

describe('Push Notification Integration Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
    
    // Initialize queue manager
    await queueManager.initialize();
  });

  afterAll(async () => {
    await queueManager.shutdown();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clean up collections
    await PushNotification.deleteMany({});
    await FcmToken.deleteMany({});
    await User.deleteMany({});
    
    // Create test user
    testUser = await User.create({
      username: 'testuser',
      email: 'test@example.com',
      password: 'Test123!@#'
    });
    
    // Get auth token (assuming you have an auth endpoint)
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'Test123!@#'
      });
    
    authToken = loginResponse.body.token;
  });

  describe('End-to-End Notification Flow', () => {
    test('should complete full notification lifecycle', async () => {
      // Step 1: Register FCM token
      const tokenResponse = await request(app)
        .post('/api/fcm-tokens')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'test_fcm_token_123',
          deviceInfo: {
            platform: 'web',
            browser: 'Chrome',
            browserVersion: '120.0'
          }
        });
      
      expect(tokenResponse.status).toBe(201);
      expect(tokenResponse.body.success).toBe(true);
      
      // Step 2: Trigger a purchase notification
      const purchaseResponse = await request(app)
        .post('/api/purchases')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [
            { productId: 'prod1', quantity: 2, price: 29.99 }
          ],
          totalAmount: 59.98,
          paymentMethod: 'card'
        });
      
      expect(purchaseResponse.status).toBe(201);
      expect(purchaseResponse.body.notifications).toBeDefined();
      expect(purchaseResponse.body.notifications.push).toBeDefined();
      
      // Step 3: Wait for queue processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Step 4: Check notification was created
      const notifications = await PushNotification.find({
        'recipient.userId': testUser._id.toString()
      });
      
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].type).toBe('purchase');
      expect(notifications[0].status).toBeOneOf(['pending', 'sent', 'delivered']);
      
      // Step 5: Verify notification details
      const notificationId = notifications[0]._id;
      const detailResponse = await request(app)
        .get(`/api/push-notifications/${notificationId}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.notification).toBeDefined();
    });

    test('should handle token registration and refresh', async () => {
      // Register initial token
      const firstToken = await request(app)
        .post('/api/fcm-tokens')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'initial_token_123'
        });
      
      expect(firstToken.status).toBe(201);
      const tokenId = firstToken.body.token._id;
      
      // Refresh token
      const refreshResponse = await request(app)
        .post('/api/fcm-tokens/refresh')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          oldToken: 'initial_token_123',
          newToken: 'refreshed_token_456'
        });
      
      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body.token.token).toBe('refreshed_token_456');
      
      // Verify old token is inactive
      const oldToken = await FcmToken.findOne({ token: 'initial_token_123' });
      expect(oldToken).toBeNull();
    });

    test('should handle batch notifications', async () => {
      // Register tokens for multiple users
      const users = await User.create([
        { username: 'user1', email: 'user1@test.com', password: 'Pass123!' },
        { username: 'user2', email: 'user2@test.com', password: 'Pass123!' },
        { username: 'user3', email: 'user3@test.com', password: 'Pass123!' }
      ]);
      
      for (const user of users) {
        await FcmToken.create({
          userId: user._id,
          token: `token_${user._id}`,
          isActive: true
        });
      }
      
      // Send batch notifications
      const batchResponse = await request(app)
        .post('/api/push-notifications/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          notifications: users.map(user => ({
            type: 'signup',
            userId: user._id.toString(),
            data: {
              username: user.username,
              email: user.email
            }
          }))
        });
      
      expect(batchResponse.status).toBe(200);
      expect(batchResponse.body.successful).toBe(3);
      expect(batchResponse.body.failed).toBe(0);
    });

    test('should handle notification retry mechanism', async () => {
      // Create a notification that will fail
      const notification = await PushNotification.create({
        type: 'purchase',
        recipient: {
          userId: testUser._id,
          username: testUser.username,
          email: testUser.email
        },
        title: 'Test Purchase',
        body: 'Test purchase notification',
        status: 'pending',
        attempts: 0
      });
      
      // Add to retry queue
      await queueManager.addPushJob('pushRetry1', {
        type: 'purchase',
        notificationId: notification._id.toString(),
        userId: testUser._id.toString(),
        attempt: 1
      });
      
      // Wait for retry processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check notification was retried
      const updated = await PushNotification.findById(notification._id);
      expect(updated.attempts).toBeGreaterThan(0);
    });

    test('should track notification delivery and clicks', async () => {
      // Create and send notification
      const notification = await PushNotification.create({
        type: 'friend_request',
        recipient: {
          userId: testUser._id,
          username: testUser.username
        },
        title: 'Friend Request',
        body: 'You have a new friend request',
        status: 'sent',
        messageId: 'msg_123'
      });
      
      // Mark as delivered
      const deliveryResponse = await request(app)
        .post(`/api/push-notifications/${notification._id}/delivered`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          deliveredAt: new Date().toISOString()
        });
      
      expect(deliveryResponse.status).toBe(200);
      
      // Track click
      const clickResponse = await request(app)
        .post(`/api/push-notifications/${notification._id}/clicked`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          clickedAt: new Date().toISOString(),
          url: '/friends'
        });
      
      expect(clickResponse.status).toBe(200);
      
      // Verify tracking
      const tracked = await PushNotification.findById(notification._id);
      expect(tracked.status).toBe('clicked');
      expect(tracked.timestamps.deliveredAt).toBeDefined();
      expect(tracked.timestamps.clickedAt).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid FCM token gracefully', async () => {
      const response = await request(app)
        .post('/api/fcm-tokens')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'invalid'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid token format');
    });

    test('should handle notification send failures', async () => {
      // Register an invalid token
      await FcmToken.create({
        userId: testUser._id,
        token: 'invalid_token_that_will_fail',
        isActive: true
      });
      
      // Try to send test notification
      const response = await request(app)
        .post('/api/push-notifications/test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUser._id.toString()
        });
      
      // Should handle gracefully even if Firebase rejects it
      expect([200, 500]).toContain(response.status);
      if (response.status === 500) {
        expect(response.body.error).toBeDefined();
      }
    });

    test('should handle stale token cleanup', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);
      
      // Create stale tokens
      await FcmToken.create([
        {
          userId: testUser._id,
          token: 'stale_token_1',
          lastActivityAt: oldDate,
          isActive: true
        },
        {
          userId: testUser._id,
          token: 'stale_token_2',
          lastActivityAt: oldDate,
          isActive: true
        }
      ]);
      
      // Run cleanup
      const cleanupResponse = await request(app)
        .post('/api/fcm-tokens/cleanup')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(cleanupResponse.status).toBe(200);
      expect(cleanupResponse.body.removed).toBe(2);
      
      // Verify tokens were removed
      const remaining = await FcmToken.countDocuments({
        userId: testUser._id
      });
      expect(remaining).toBe(0);
    });

    test('should handle queue failures and move to DLQ', async () => {
      // Create a notification that will fail multiple times
      const notification = await PushNotification.create({
        type: 'purchase',
        recipient: { userId: 'invalid_user' },
        title: 'Test',
        body: 'Test',
        status: 'pending',
        attempts: 5 // Already exceeded retry limit
      });
      
      // Add to DLQ
      await queueManager.addPushJob('pushDlq', {
        type: 'purchase',
        notificationId: notification._id.toString(),
        userId: 'invalid_user',
        failureReason: 'Max retries exceeded'
      });
      
      // Check DLQ stats
      const stats = await queueManager.getQueueStats();
      expect(stats.pushDlq).toBeDefined();
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should get notification statistics', async () => {
      // Create various notifications
      await PushNotification.create([
        {
          type: 'purchase',
          recipient: { userId: testUser._id },
          title: 'Test',
          body: 'Test',
          status: 'delivered'
        },
        {
          type: 'purchase',
          recipient: { userId: testUser._id },
          title: 'Test',
          body: 'Test',
          status: 'failed'
        },
        {
          type: 'signup',
          recipient: { userId: testUser._id },
          title: 'Test',
          body: 'Test',
          status: 'delivered'
        }
      ]);
      
      const response = await request(app)
        .get('/api/push-notifications/statistics')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.notifications.total).toBe(3);
      expect(response.body.notifications.byStatus.delivered).toBe(2);
      expect(response.body.notifications.byStatus.failed).toBe(1);
      expect(response.body.notifications.byType.purchase).toBe(2);
    });

    test('should get user-specific notification history', async () => {
      // Create notifications for different users
      await PushNotification.create([
        {
          type: 'purchase',
          recipient: { userId: testUser._id },
          title: 'Your Purchase',
          body: 'Purchase confirmed',
          status: 'delivered'
        },
        {
          type: 'login',
          recipient: { userId: testUser._id },
          title: 'Login Alert',
          body: 'New login',
          status: 'delivered'
        },
        {
          type: 'purchase',
          recipient: { userId: 'other_user' },
          title: 'Other Purchase',
          body: 'Not for test user',
          status: 'delivered'
        }
      ]);
      
      const response = await request(app)
        .get('/api/push-notifications')
        .query({ userId: testUser._id.toString() })
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(response.status).toBe(200);
      expect(response.body.notifications.length).toBe(2);
      expect(response.body.notifications.every(n => 
        n.recipient.userId === testUser._id.toString()
      )).toBe(true);
    });

    test('should track click-through rates', async () => {
      // Create notifications with different click states
      const notifications = await PushNotification.create([
        {
          type: 'purchase',
          recipient: { userId: testUser._id },
          title: 'Test',
          body: 'Test',
          status: 'clicked',
          timestamps: { clickedAt: new Date() }
        },
        {
          type: 'purchase',
          recipient: { userId: testUser._id },
          title: 'Test',
          body: 'Test',
          status: 'delivered'
        },
        {
          type: 'purchase',
          recipient: { userId: testUser._id },
          title: 'Test',
          body: 'Test',
          status: 'delivered'
        }
      ]);
      
      const stats = await PushNotification.getClickThroughRate();
      
      expect(stats.totalDelivered).toBe(3);
      expect(stats.totalClicked).toBe(1);
      expect(stats.clickThroughRate).toBeCloseTo(33.33, 1);
    });
  });
});