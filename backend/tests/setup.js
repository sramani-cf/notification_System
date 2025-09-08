// Jest test setup file
const mongoose = require('mongoose');

// Increase timeout for database operations
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Clean up after all tests
afterAll(async () => {
  // Close database connections
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  
  // Clear all timers
  jest.clearAllTimers();
});

// Global test utilities
global.testUtils = {
  // Generate random email
  randomEmail: () => `test_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`,
  
  // Generate random FCM token
  randomFCMToken: () => `fcm_${Date.now()}_${Math.random().toString(36).substring(2)}:APA91b${Math.random().toString(36).substring(2)}`,
  
  // Wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create test user data
  createTestUser: (overrides = {}) => ({
    username: `testuser_${Date.now()}`,
    email: global.testUtils.randomEmail(),
    password: 'Test123!@#',
    ...overrides
  }),
  
  // Create test notification data
  createTestNotification: (type = 'test', overrides = {}) => ({
    type,
    recipient: {
      userId: new mongoose.Types.ObjectId().toString(),
      username: 'testuser',
      email: 'test@example.com'
    },
    title: 'Test Notification',
    body: 'This is a test notification',
    status: 'pending',
    ...overrides
  })
};