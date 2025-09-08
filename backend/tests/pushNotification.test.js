const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const PushNotification = require('../models/pushNotification.model');
const FcmToken = require('../models/fcmToken.model');
const pushNotificationService = require('../services/pushNotificationService');
const fcmTokenService = require('../services/fcmTokenService');

let mongoServer;

describe('Push Notification System Tests', () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await PushNotification.deleteMany({});
    await FcmToken.deleteMany({});
  });

  describe('PushNotification Model', () => {
    test('should create a new push notification', async () => {
      const notificationData = {
        type: 'purchase',
        recipient: {
          userId: 'user123',
          username: 'testuser',
          email: 'test@example.com'
        },
        title: 'Purchase Confirmation',
        body: 'Your purchase was successful',
        priority: 'high',
        status: 'pending'
      };

      const notification = new PushNotification(notificationData);
      const saved = await notification.save();

      expect(saved._id).toBeDefined();
      expect(saved.type).toBe('purchase');
      expect(saved.status).toBe('pending');
      expect(saved.attempts).toBe(0);
    });

    test('should mark notification as sent', async () => {
      const notification = await PushNotification.create({
        type: 'signup',
        recipient: { userId: 'user123' },
        title: 'Welcome',
        body: 'Welcome to our app',
        status: 'pending'
      });

      await notification.markAsSent('msg123');
      
      expect(notification.status).toBe('sent');
      expect(notification.messageId).toBe('msg123');
      expect(notification.timestamps.sentAt).toBeDefined();
    });

    test('should mark notification as delivered', async () => {
      const notification = await PushNotification.create({
        type: 'login',
        recipient: { userId: 'user123' },
        title: 'Login Alert',
        body: 'New login detected',
        status: 'sent'
      });

      await notification.markAsDelivered();
      
      expect(notification.status).toBe('delivered');
      expect(notification.timestamps.deliveredAt).toBeDefined();
    });

    test('should mark notification as failed with reason', async () => {
      const notification = await PushNotification.create({
        type: 'reset_password',
        recipient: { userId: 'user123' },
        title: 'Password Reset',
        body: 'Reset your password',
        status: 'pending'
      });

      await notification.markAsFailed('Invalid token');
      
      expect(notification.status).toBe('failed');
      expect(notification.failureReason).toBe('Invalid token');
      expect(notification.timestamps.failedAt).toBeDefined();
    });

    test('should increment attempt count', async () => {
      const notification = await PushNotification.create({
        type: 'friend_request',
        recipient: { userId: 'user123' },
        title: 'Friend Request',
        body: 'You have a new friend request',
        status: 'pending'
      });

      await notification.incrementAttempt();
      expect(notification.attempts).toBe(1);
      
      await notification.incrementAttempt();
      expect(notification.attempts).toBe(2);
      expect(notification.timestamps.lastAttemptAt).toBeDefined();
    });

    test('should get notification statistics', async () => {
      // Create test notifications
      await PushNotification.create([
        { type: 'purchase', recipient: { userId: 'user1' }, status: 'delivered', title: 'Test', body: 'Test' },
        { type: 'purchase', recipient: { userId: 'user2' }, status: 'failed', title: 'Test', body: 'Test' },
        { type: 'signup', recipient: { userId: 'user3' }, status: 'delivered', title: 'Test', body: 'Test' },
        { type: 'login', recipient: { userId: 'user4' }, status: 'pending', title: 'Test', body: 'Test' }
      ]);

      const stats = await PushNotification.getStatistics();
      
      expect(stats.total).toBe(4);
      expect(stats.byStatus.delivered).toBe(2);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byType.purchase).toBe(2);
    });
  });

  describe('FcmToken Model', () => {
    test('should create a new FCM token', async () => {
      const tokenData = {
        userId: 'user123',
        token: 'fcm_token_123',
        deviceInfo: {
          platform: 'web',
          browser: 'Chrome',
          browserVersion: '120.0',
          os: 'Windows'
        }
      };

      const fcmToken = new FcmToken(tokenData);
      const saved = await fcmToken.save();

      expect(saved._id).toBeDefined();
      expect(saved.userId).toBe('user123');
      expect(saved.token).toBe('fcm_token_123');
      expect(saved.isActive).toBe(true);
    });

    test('should detect stale tokens', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35); // 35 days ago

      const staleToken = await FcmToken.create({
        userId: 'user123',
        token: 'old_token',
        lastActivityAt: oldDate
      });

      const freshToken = await FcmToken.create({
        userId: 'user456',
        token: 'fresh_token',
        lastActivityAt: new Date()
      });

      expect(staleToken.isStale()).toBe(true);
      expect(freshToken.isStale()).toBe(false);
    });

    test('should update activity timestamp', async () => {
      const token = await FcmToken.create({
        userId: 'user123',
        token: 'fcm_token'
      });

      const originalActivity = token.lastActivityAt;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await token.updateActivity();

      expect(token.lastActivityAt.getTime()).toBeGreaterThan(originalActivity.getTime());
    });

    test('should find active tokens for user', async () => {
      await FcmToken.create([
        { userId: 'user123', token: 'token1', isActive: true },
        { userId: 'user123', token: 'token2', isActive: false },
        { userId: 'user456', token: 'token3', isActive: true }
      ]);

      const tokens = await FcmToken.findActiveTokensForUser('user123');
      
      expect(tokens.length).toBe(1);
      expect(tokens[0].token).toBe('token1');
    });

    test('should validate token format', () => {
      const validToken = 'dKz3cV7QRKO-7F5uXGnwFH:APA91bHZQlEPMxU6wFhN2z4DpL1234567890';
      const invalidToken = 'invalid';

      expect(FcmToken.isValidTokenFormat(validToken)).toBe(true);
      expect(FcmToken.isValidTokenFormat(invalidToken)).toBe(false);
    });

    test('should cleanup stale tokens', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 35);

      await FcmToken.create([
        { userId: 'user1', token: 'stale1', lastActivityAt: oldDate },
        { userId: 'user2', token: 'stale2', lastActivityAt: oldDate },
        { userId: 'user3', token: 'fresh', lastActivityAt: new Date() }
      ]);

      const result = await FcmToken.cleanupStaleTokens();
      
      expect(result.deletedCount).toBe(2);
      
      const remaining = await FcmToken.countDocuments();
      expect(remaining).toBe(1);
    });
  });

  describe('Push Notification Service', () => {
    beforeEach(() => {
      // Mock Firebase Admin SDK
      jest.spyOn(pushNotificationService, 'isReady').mockReturnValue(true);
    });

    test('should validate notification type', async () => {
      await expect(
        pushNotificationService.sendPushNotification('invalid_type', {})
      ).rejects.toThrow('Invalid notification type');
    });

    test('should generate correct title for notification types', () => {
      expect(pushNotificationService.generateTitle('signup', {}))
        .toBe('Welcome to Notification System!');
      
      expect(pushNotificationService.generateTitle('purchase', {}))
        .toBe('🛍️ Purchase Confirmation');
      
      expect(pushNotificationService.generateTitle('friend_request', {}))
        .toBe('👥 New Friend Request');
    });

    test('should generate correct body for notification types', () => {
      const signupBody = pushNotificationService.generateBody('signup', {
        username: 'John'
      });
      expect(signupBody).toContain('Welcome John');

      const purchaseBody = pushNotificationService.generateBody('purchase', {
        totalAmount: 99.99,
        orderId: 'ORD123'
      });
      expect(purchaseBody).toContain('$99.99');
      expect(purchaseBody).toContain('ORD123');
    });

    test('should get correct notification priority', () => {
      expect(pushNotificationService.getNotificationPriority('reset_password')).toBe(10);
      expect(pushNotificationService.getNotificationPriority('purchase')).toBe(8);
      expect(pushNotificationService.getNotificationPriority('signup')).toBe(5);
      expect(pushNotificationService.getNotificationPriority('login')).toBe(3);
      expect(pushNotificationService.getNotificationPriority('friend_request')).toBe(2);
    });

    test('should validate FCM message format', () => {
      const validMessage = {
        notification: {
          title: 'Test',
          body: 'Test message'
        },
        token: 'test_token'
      };

      const invalidMessage = {
        notification: {
          title: 'Test'
          // Missing body
        },
        token: 'test_token'
      };

      expect(() => pushNotificationService.validateFCMMessage(validMessage))
        .not.toThrow();
      
      expect(() => pushNotificationService.validateFCMMessage(invalidMessage))
        .toThrow('FCM notification must contain title and body');
    });
  });

  describe('FCM Token Service', () => {
    test('should register new token', async () => {
      const tokenData = {
        userId: 'user123',
        token: 'new_fcm_token',
        deviceInfo: {
          platform: 'web',
          browser: 'Firefox'
        }
      };

      const result = await fcmTokenService.registerToken(tokenData);
      
      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.isNew).toBe(true);
    });

    test('should update existing token', async () => {
      // First registration
      await fcmTokenService.registerToken({
        userId: 'user123',
        token: 'existing_token'
      });

      // Update same token
      const result = await fcmTokenService.registerToken({
        userId: 'user123',
        token: 'existing_token',
        deviceInfo: {
          platform: 'mobile'
        }
      });

      expect(result.success).toBe(true);
      expect(result.isNew).toBe(false);
      expect(result.message).toContain('updated');
    });

    test('should remove token', async () => {
      const { token } = await fcmTokenService.registerToken({
        userId: 'user123',
        token: 'token_to_remove'
      });

      const result = await fcmTokenService.removeToken(token._id);
      
      expect(result.success).toBe(true);
      
      const count = await FcmToken.countDocuments({ token: 'token_to_remove' });
      expect(count).toBe(0);
    });

    test('should get all active tokens for user', async () => {
      await fcmTokenService.registerToken({
        userId: 'user123',
        token: 'token1'
      });
      
      await fcmTokenService.registerToken({
        userId: 'user123',
        token: 'token2'
      });

      const tokens = await fcmTokenService.getUserTokens('user123');
      
      expect(tokens.length).toBe(2);
      expect(tokens.every(t => t.userId === 'user123')).toBe(true);
    });

    test('should validate token before operations', async () => {
      const result = await fcmTokenService.validateToken('invalid_token_format');
      
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Invalid token format');
    });
  });
});