# Email Notification System with Fanout Architecture

## Overview

This notification system implements a fanout architecture using BullMQ for reliable email delivery with advanced retry mechanisms and dead letter queue (DLQ) handling.

## Architecture Flow

```
Controller Action → NotificationService (Fanout) → Mail Queue → Worker → SMTP Mail Server
                                                     ↓
                                      Failed? → Retry-1 Queue (5 min delay)
                                                     ↓
                                      Failed? → Retry-2 Queue (30 min delay)
                                                     ↓
                                      Failed? → Dead Letter Queue (DLQ)
```

## Features

- **Fanout Architecture**: Single notification service distributes to appropriate channels
- **Advanced Retry Logic**: 4 in-process attempts with exponential backoff + queue escalation
- **MongoDB Tracking**: Complete status tracking throughout the notification lifecycle
- **Dead Letter Queue**: Permanent failure handling for manual intervention
- **Health Monitoring**: Queue and worker health checks via API endpoints
- **Graceful Shutdown**: Proper cleanup of workers and connections

## Retry Process

### In-Process Retries (BullMQ)
1. **Attempt 1**: Immediate retry (0ms delay)
2. **Attempt 2**: 1 second delay
3. **Attempt 3**: 2 seconds delay
4. **Attempt 4**: 4 seconds delay

### Escalated Retries (Queue-to-Queue)
- After 4 failed attempts → **Retry-1 Queue** (5 minute delay)
- Retry-1 fails → **Retry-2 Queue** (30 minute delay)
- Retry-2 fails → **Dead Letter Queue** (DLQ)

### Status Tracking
- **Success Path**: Delivery successful → ACK event → MongoDB updated to `delivered`
- **Failure Path**: All retries exhausted → DLQ → MongoDB updated to `failed`

## Setup Instructions

### Prerequisites
1. **Redis Server**: Required for BullMQ queues
2. **MongoDB**: For data persistence and notification tracking
3. **SMTP Server**: For email delivery

### Environment Variables

Create a `.env` file in the backend directory:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/notification_system

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Email Configuration (Required for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=noreply@notification-system.com

# Server Ports
LOAD_BALANCER_PORT=8000
SERVER1_PORT=5001
SERVER2_PORT=5002
SERVER3_PORT=5003

# Queue Configuration
MAIL_QUEUE_CONCURRENCY=5
RETRY_1_DELAY=300000
RETRY_1_CONCURRENCY=3
RETRY_2_DELAY=1800000
RETRY_2_CONCURRENCY=2
DLQ_CONCURRENCY=1

# Notification Settings
NOTIFICATION_MAX_ATTEMPTS=4
NOTIFICATION_CLEANUP_DAYS=30

# Logging
LOG_LEVEL=info
```

### Installation

```bash
# Install dependencies
cd backend
npm install

# Start Redis (if not already running)
redis-server

# Start MongoDB (if not already running)
mongod

# Start all servers
npm run dev
```

## Notification Types

The system currently supports email notifications for:

1. **Signup** - Welcome emails for new users
2. **Login** - Security alert emails for new logins  
3. **Password Reset** - Password reset emails with tokens/links

## API Endpoints

### Health & Monitoring

```bash
# Basic health check
GET /api/health

# Queue health and statistics
GET /api/queue-health

# Notification statistics
GET /api/notification-stats

# Queue management
POST /api/queue/{queueName}/pause
POST /api/queue/{queueName}/resume
```

### Testing the System

```bash
# Test signup notification (triggers welcome email)
curl -X POST http://localhost:8000/api/signups \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User",
    "userId": 12345
  }'

# Test login notification (triggers security alert)
curl -X POST http://localhost:8000/api/logins \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "userId": 12345,
    "ipAddress": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
  }'

# Test password reset notification
curl -X POST http://localhost:8000/api/reset-passwords \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "userId": 12345,
    "resetToken": "abc123def456"
  }'
```

## Monitoring & Management

### View Queue Statistics

```bash
# Check queue health
curl http://localhost:8000/api/queue-health

# View notification statistics
curl http://localhost:8000/api/notification-stats
```

### Queue Management

```bash
# Pause a queue
curl -X POST http://localhost:8000/api/queue/mail/pause

# Resume a queue
curl -X POST http://localhost:8000/api/queue/mail/resume
```

## File Structure

```
backend/
├── config/
│   └── index.js              # Configuration with Redis & queue settings
├── constants/
│   └── index.js              # Notification types and status constants
├── controllers/
│   ├── signup.controller.js   # Updated with email notifications
│   ├── login.controller.js    # Updated with email notifications
│   └── resetPassword.controller.js # Updated with email notifications
├── models/
│   └── emailNotification.model.js # MongoDB model for tracking
├── queues/
│   └── index.js              # Queue manager with BullMQ setup
├── services/
│   ├── emailService.js       # SMTP email delivery service
│   └── notificationService.js # Fanout notification service
├── workers/
│   └── mailWorker.js         # Email workers with retry logic
├── routes/
│   └── health.routes.js      # Updated with queue monitoring
└── servers/
    └── server1.js            # Updated with notification system startup
```

## Error Handling

- **Email Service Failures**: Logged but don't block main operations
- **Queue Connection Issues**: Graceful degradation with error logging
- **Worker Failures**: Automatic retry with exponential backoff
- **Permanent Failures**: Moved to DLQ for manual intervention

## Production Considerations

1. **Email Provider Limits**: Configure rate limiting based on your SMTP provider
2. **Redis Persistence**: Enable Redis persistence for queue durability
3. **MongoDB Indexing**: Indexes are automatically created for query performance
4. **Monitoring**: Set up alerts for DLQ messages and failed notification rates
5. **Scaling**: Add more workers by increasing concurrency settings

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**: Ensure Redis server is running and accessible
2. **Email Not Sending**: Verify SMTP credentials and settings
3. **Queue Not Processing**: Check worker initialization and Redis connection
4. **High Memory Usage**: Tune queue cleanup settings and job retention

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# View queue contents (in Redis CLI)
KEYS *queue*

# Check MongoDB collections
use notification_system
db.emailnotifications.find().limit(5)
```

## Next Steps

The system is ready for:
- Additional notification channels (SMS, Push notifications)
- More sophisticated routing rules
- Advanced monitoring and alerting
- Load balancing across multiple worker instances