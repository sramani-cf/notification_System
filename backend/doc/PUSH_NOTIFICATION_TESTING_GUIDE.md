# Push Notification System - Manual Testing Guide

## Prerequisites

Before starting manual testing, ensure:
1. MongoDB is running locally or accessible
2. Redis server is running
3. Firebase project is configured with valid credentials
4. Backend servers are running (`npm run dev`)
5. Frontend application is running (`npm run dev`)
6. Browser supports Web Push API (Chrome, Firefox, Edge)

## Test Environment Setup

### 1. Browser Configuration
```bash
# Chrome - Enable notifications
chrome://settings/content/notifications

# Firefox - Enable notifications  
about:preferences#privacy

# Clear existing permissions for fresh testing
chrome://settings/content/all
```

### 2. Test User Accounts
Create test users with different scenarios:
```javascript
// Test users
user1@test.com - Primary test user
user2@test.com - Secondary for friend requests
user3@test.com - User with disabled notifications
```

## Manual Testing Checklist

### Phase 1: Permission Flow Testing

#### Test Case 1.1: Initial Permission Request
**Steps:**
1. Open application in incognito/private mode
2. Log in with test user
3. Observe permission prompt appearance
4. Click "Allow"

**Expected Result:**
- Permission prompt appears within 3 seconds of login
- Browser shows notification permission dialog
- After allowing, status updates to "Notifications Enabled"

**Verification:**
```javascript
// Browser Console
Notification.permission // Should return "granted"
```

---

#### Test Case 1.2: Permission Denied Handling
**Steps:**
1. Open application in new incognito window
2. Log in with test user
3. Click "Block" on permission prompt

**Expected Result:**
- Application handles denial gracefully
- Shows message: "Notifications blocked. Enable in browser settings"
- No errors in console

---

#### Test Case 1.3: Permission Reset
**Steps:**
1. Reset site permissions in browser
2. Refresh application
3. Re-request permissions from settings

**Expected Result:**
- Permission prompt reappears
- Previous token is invalidated
- New token generated after permission granted

---

### Phase 2: Token Generation and Registration

#### Test Case 2.1: FCM Token Generation
**Steps:**
1. Grant notification permissions
2. Open browser DevTools > Application > Service Workers
3. Check localStorage for FCM token

**Expected Result:**
- Token generated within 5 seconds
- Token format: long alphanumeric string
- Token stored in localStorage key: `fcm_token`

**Verification:**
```javascript
// Browser Console
localStorage.getItem('fcm_token')
```

---

#### Test Case 2.2: Token Registration with Backend
**Steps:**
1. Monitor Network tab in DevTools
2. Grant permissions and generate token
3. Observe POST request to `/api/fcm-tokens`

**Expected Result:**
- Request payload contains token and device info
- Response status: 201 Created
- Token saved in database

**Backend Verification:**
```bash
# Check MongoDB
db.fcmtokens.find({ userId: "USER_ID" })
```

---

#### Test Case 2.3: Token Refresh
**Steps:**
1. Delete token from localStorage
2. Refresh page
3. Observe new token generation

**Expected Result:**
- New token generated automatically
- Old token marked inactive in database
- No duplicate active tokens for user

---

### Phase 3: Notification Display Testing

#### Test Case 3.1: Foreground Notification
**Steps:**
1. Keep application tab active
2. Trigger test notification:
```bash
curl -X POST http://localhost:5000/api/push-notifications/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID"}'
```

**Expected Result:**
- In-app toast notification appears
- Notification shows title and body
- Auto-dismisses after 5 seconds

---

#### Test Case 3.2: Background Notification
**Steps:**
1. Switch to different tab or minimize browser
2. Trigger test notification
3. Observe system notification

**Expected Result:**
- Native OS notification appears
- Notification includes app icon
- Click returns to application

---

#### Test Case 3.3: Multiple Notifications
**Steps:**
1. Trigger 3 notifications rapidly:
```bash
for i in {1..3}; do
  curl -X POST http://localhost:5000/api/push-notifications/test \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -d '{"userId": "USER_ID", "message": "Test '$i'"}'
done
```

**Expected Result:**
- All notifications display
- Notifications stack properly
- No notifications lost

---

### Phase 4: Notification Types Testing

#### Test Case 4.1: Purchase Notification
**Steps:**
1. Click "Test Purchase" button in app
2. Complete purchase flow
3. Observe notification

**Expected Result:**
- Notification title: "🛍️ Purchase Confirmation"
- Body contains order amount and ID
- Click opens order details

**Payload Verification:**
```javascript
// Expected notification data
{
  type: "purchase",
  title: "🛍️ Purchase Confirmation",
  body: "Your purchase of $99.99 has been processed successfully. Order ID: ORD123",
  clickAction: "/orders"
}
```

---

#### Test Case 4.2: Friend Request Notification
**Steps:**
1. Send friend request from user2 to user1
2. Observe notification on user1's device

**Expected Result:**
- Notification title: "👥 New Friend Request"
- Body contains sender's username
- Action buttons: Accept/Decline

---

#### Test Case 4.3: Login Alert Notification
**Steps:**
1. Log in from different browser/device
2. Observe notification on primary device

**Expected Result:**
- Notification title: "🔐 New Login Alert"
- Body contains location and time
- High priority delivery

---

### Phase 5: Click Action Testing

#### Test Case 5.1: Notification Click Navigation
**Steps:**
1. Receive notification while app is open
2. Click on notification
3. Observe navigation

**Expected Result:**
- App navigates to relevant page
- Click tracked in database
- Notification marked as read

---

#### Test Case 5.2: Notification Actions
**Steps:**
1. Receive friend request notification
2. Click "Accept" action button
3. Verify action processed

**Expected Result:**
- Action processed without opening app
- Friend request accepted
- Confirmation shown

---

### Phase 6: Error Handling Testing

#### Test Case 6.1: Offline Notification Queueing
**Steps:**
1. Disconnect internet
2. Trigger notification from another device
3. Reconnect internet

**Expected Result:**
- Notification delivered after reconnection
- No duplicate notifications
- Proper timestamp maintained

---

#### Test Case 6.2: Invalid Token Handling
**Steps:**
1. Manually corrupt token in database
2. Trigger notification
3. Check error handling

**Expected Result:**
- Error logged in backend
- Token marked as invalid
- Retry mechanism triggered

---

### Phase 7: Performance Testing

#### Test Case 7.1: Notification Delivery Time
**Steps:**
1. Trigger notification
2. Measure time from trigger to display
3. Record in different scenarios

**Acceptance Criteria:**
- Foreground: < 1 second
- Background: < 2 seconds
- Multiple devices: < 3 seconds

---

#### Test Case 7.2: Batch Notification Performance
**Steps:**
1. Send 50 notifications to different users
2. Monitor queue processing
3. Check delivery success rate

**Expected Result:**
- All notifications queued successfully
- > 95% delivery success rate
- Queue processes within 10 seconds

---

### Phase 8: Cross-Browser Testing

#### Test Case 8.1: Chrome Testing
**Browser:** Chrome 120+
**Test:** Complete full notification flow
**Expected:** All features working

---

#### Test Case 8.2: Firefox Testing
**Browser:** Firefox 120+
**Test:** Complete full notification flow
**Expected:** All features working

---

#### Test Case 8.3: Edge Testing
**Browser:** Edge 120+
**Test:** Complete full notification flow
**Expected:** All features working

---

#### Test Case 8.4: Safari Testing
**Browser:** Safari 16.4+
**Test:** Basic notification support
**Note:** Limited support for some features

---

### Phase 9: Mobile Testing

#### Test Case 9.1: Android Chrome
**Device:** Android 8+
**Steps:**
1. Open application in Chrome
2. Complete permission flow
3. Test notifications

**Expected Result:**
- Notifications appear in notification tray
- Vibration on notification
- Click opens app

---

#### Test Case 9.2: iOS Safari
**Device:** iOS 16.4+
**Steps:**
1. Add app to home screen
2. Grant permissions
3. Test notifications

**Expected Result:**
- Notifications work in PWA mode
- Badge count updates
- Click opens PWA

---

### Phase 10: Monitoring and Logging

#### Test Case 10.1: Delivery Tracking
**Steps:**
1. Send 10 test notifications
2. Check statistics endpoint:
```bash
curl http://localhost:5000/api/push-notifications/statistics
```

**Expected Result:**
```json
{
  "total": 10,
  "delivered": 9,
  "failed": 1,
  "clickThrough": 5,
  "deliveryRate": "90%",
  "clickRate": "55.56%"
}
```

---

#### Test Case 10.2: Error Logging
**Steps:**
1. Check backend logs for errors
2. Review failed notification reasons
3. Verify retry attempts

**Log Locations:**
```bash
# Backend logs
tail -f backend/logs/push-notifications.log

# Worker logs
tail -f backend/logs/push-worker.log

# Queue logs
tail -f backend/logs/queue.log
```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### Issue 1: Notifications Not Appearing
**Symptoms:** Permission granted but no notifications
**Solutions:**
1. Check browser notification settings
2. Verify service worker is registered
3. Check FCM token validity
4. Review backend logs for errors

---

#### Issue 2: Token Registration Fails
**Symptoms:** 400/500 errors on token registration
**Solutions:**
1. Verify Firebase configuration
2. Check VAPID key correctness
3. Ensure Firebase project is active
4. Review service account permissions

---

#### Issue 3: Notifications Delayed
**Symptoms:** Long delay between trigger and display
**Solutions:**
1. Check Redis connection
2. Monitor queue depth
3. Verify worker concurrency settings
4. Check Firebase quotas

---

#### Issue 4: Click Actions Not Working
**Symptoms:** Clicking notification doesn't navigate
**Solutions:**
1. Check service worker click handler
2. Verify click tracking endpoint
3. Review client-side routing
4. Check for console errors

---

## Test Data Reset

### Clean Test Environment
```bash
# Clear all test notifications
db.pushnotifications.deleteMany({ "recipient.email": /test.com$/ })

# Clear test tokens
db.fcmtokens.deleteMany({ userId: { $in: TEST_USER_IDS } })

# Clear Redis queues
redis-cli FLUSHDB

# Restart services
npm run restart:all
```

---

## Automated Test Execution

### Run Unit Tests
```bash
cd backend
npm test tests/pushNotification.test.js
```

### Run Integration Tests
```bash
cd backend
npm test tests/pushNotification.integration.test.js
```

### Run E2E Tests
```bash
cd frontend
npm run test:e2e
```

---

## Performance Benchmarks

### Expected Performance Metrics
- Token Generation: < 2 seconds
- Notification Delivery: < 1 second (foreground)
- Click Response: < 500ms
- Queue Processing: 100 notifications/second
- Database Queries: < 50ms
- API Response: < 200ms

---

## Security Testing

### Security Checklist
- [ ] Tokens encrypted in database
- [ ] HTTPS enforced for all endpoints
- [ ] Rate limiting on notification endpoints
- [ ] User authorization for token access
- [ ] XSS protection in notification content
- [ ] CSRF tokens for state-changing operations

---

## Reporting Issues

### Bug Report Template
```markdown
**Environment:**
- Browser: [Chrome 120]
- OS: [Windows 11]
- User Role: [Standard User]

**Steps to Reproduce:**
1. [First Step]
2. [Second Step]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Screenshots/Logs:**
[Attach relevant evidence]

**Additional Context:**
[Any other relevant information]
```

---

## Sign-off Criteria

### Testing Complete When:
- [ ] All test cases pass
- [ ] No critical bugs remain
- [ ] Performance meets benchmarks
- [ ] Security requirements satisfied
- [ ] Documentation complete
- [ ] Stakeholder approval received

---

*Last Updated: 2025-09-08*
*Version: 1.0*