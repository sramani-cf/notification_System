# Notification System Setup Guide

## Port Configuration

### Backend Services (Port 8000)
- **Load Balancer**: Port 8000 (main entry point)
- **Server 1**: Port 5001 (internal)
- **Server 2**: Port 5002 (internal)
- **Server 3**: Port 5003 (internal)

### Frontend (Port 3000)
- **Next.js Development Server**: Port 3000

## Prerequisites

1. **Node.js** (v16 or higher)
2. **MongoDB** (running on localhost:27017)
3. **Redis** (running on localhost:6379)
4. **Firebase Project** (optional, for push notifications)

## Backend Setup

### 1. Navigate to backend directory
```bash
cd backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create environment file
```bash
cp .env.example .env
```

### 4. Configure environment variables in `.env`

#### Required configurations:
```env
# Server Configuration
PORT=8000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/notification_system

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000
```

#### Optional configurations for full functionality:

**Email notifications (SMTP):**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_specific_password
```

**Push notifications (Firebase):**
```env
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your_project.iam.gserviceaccount.com
```

### 5. Start backend services
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start:all
```

This will start:
- Load balancer on http://localhost:8000
- 3 backend servers on ports 5001, 5002, 5003

## Frontend Setup

### 1. Navigate to frontend directory
```bash
cd frontend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create environment file
```bash
cp .env.example .env.local
```

### 4. Configure environment variables in `.env.local`

#### Required configurations:
```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000

# WebSocket Configuration
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

#### Optional configurations for push notifications:
```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_VAPID_KEY=your_vapid_key
```

### 5. Start frontend development server
```bash
npm run dev
```

The frontend will be available at http://localhost:3000

## Testing the System

### 1. Verify all services are running

**Backend Health Check:**
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "servers": [
    {"url": "http://localhost:5001", "status": "healthy"},
    {"url": "http://localhost:5002", "status": "healthy"},
    {"url": "http://localhost:5003", "status": "healthy"}
  ]
}
```

**Frontend:**
Open http://localhost:3000 in your browser

### 2. Test notification flow

1. Open the frontend at http://localhost:3000
2. Click "New Purchase" button to test push notifications
3. Check the response display for notification status
4. Monitor the push notification delivery status

### 3. Run automated tests

**Backend tests:**
```bash
cd backend
npm test
```

**Push notification tracking test:**
```bash
cd backend
node tests/test-push-tracking.js
```

## Architecture Overview

```
┌─────────────┐
│   Frontend  │ Port 3000
│   (Next.js) │
└──────┬──────┘
       │ HTTP/WebSocket
       ▼
┌─────────────┐
│Load Balancer│ Port 8000
│  (Express)  │
└──────┬──────┘
       │ Round-robin
       ▼
┌─────────────────────────────┐
│  Backend Servers (Express)  │
│  Server 1: Port 5001        │
│  Server 2: Port 5002        │
│  Server 3: Port 5003        │
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│     Data Storage            │
│  MongoDB: Port 27017        │
│  Redis: Port 6379           │
└─────────────────────────────┘
```

## Features

### Notification Types
- **Push Notifications** (Firebase Cloud Messaging) - Only for purchases
- **Email Notifications** (SMTP)
- **In-App Notifications** (WebSocket)

### Push Notification Tracking
- Delivery status tracking (pending → sent → delivered/failed)
- Bidirectional references between purchases and notifications
- Real-time status display in frontend
- Complete audit trail with timestamps

## Troubleshooting

### Port already in use
If you get "EADDRINUSE" error:
```bash
# Find process using the port
lsof -i :8000  # On Mac/Linux
netstat -ano | findstr :8000  # On Windows

# Kill the process
kill -9 <PID>  # On Mac/Linux
taskkill /PID <PID> /F  # On Windows
```

### MongoDB connection issues
Ensure MongoDB is running:
```bash
# Start MongoDB
mongod

# Or as a service
sudo systemctl start mongodb  # Linux
brew services start mongodb-community  # Mac
```

### Redis connection issues
Ensure Redis is running:
```bash
# Start Redis
redis-server

# Or as a service
sudo systemctl start redis  # Linux
brew services start redis  # Mac
```

### Push notifications not working
1. Check Firebase configuration in `.env`
2. Verify Firebase service account credentials
3. Ensure user has granted notification permissions in browser
4. Check browser console for errors

## Development Tips

1. **Backend logs**: Each server logs with different colors in dev mode
2. **Frontend hot reload**: Changes automatically reload in browser
3. **API testing**: Use Postman or curl to test API endpoints
4. **Database GUI**: Use MongoDB Compass to view data
5. **Redis GUI**: Use RedisInsight to monitor queues

## API Documentation

### Main API Endpoints

**Purchases:**
- `POST /api/purchases` - Create purchase (triggers push notification)
- `GET /api/purchases/:id` - Get purchase details
- `GET /api/purchases` - List purchases

**Push Notifications:**
- `GET /api/push-notifications` - List notifications
- `GET /api/push-notifications/:id` - Get notification details
- `GET /api/push-notifications/purchase/:purchaseId/status` - Get notification status by purchase
- `PATCH /api/push-notifications/:id/delivery-status` - Update delivery status

**Health Check:**
- `GET /health` - Check system health

## Support

For issues or questions, check:
1. Console logs in both frontend and backend
2. MongoDB for stored data
3. Redis for queue status
4. Network tab in browser developer tools