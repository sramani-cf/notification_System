const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const logger = require('../utils/logger');

class WebSocketService {
  constructor() {
    this.io = null;
    this.isInitialized = false;
    this.connectedClients = new Map(); // userId -> { socketId, socket, connectedAt }
    this.userSockets = new Map(); // socketId -> { userId, socket, connectedAt }
  }

  /**
   * Initialize WebSocket server with Express server
   */
  initialize(httpServer, corsOptions = {}) {
    try {
      logger.info('Initializing WebSocket service...', 'WEBSOCKET-SERVICE');
      logger.info(`CORS Origin: ${corsOptions.origin || "http://localhost:3000"}`, 'WEBSOCKET-SERVICE');
      logger.info(`CORS Credentials: ${corsOptions.credentials || true}`, 'WEBSOCKET-SERVICE');
      
      this.io = new Server(httpServer, {
        cors: {
          origin: corsOptions.origin || "http://localhost:3000",
          methods: ["GET", "POST"],
          credentials: corsOptions.credentials || true,
          allowedHeaders: ["*"]
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
        allowEIO3: true,
        // Allow connections from load balancer
        allowRequest: (req, callback) => {
          // Accept all connections (authentication happens after connection)
          callback(null, true);
        }
      });

      // Set up Redis adapter for multi-server communication
      this.setupRedisAdapter();

      this.setupEventHandlers();
      this.isInitialized = true;
      
      logger.success('WebSocket service initialized successfully', 'WEBSOCKET-SERVICE');
      logger.info(`Total event handlers registered: connection, auth, notifications, ping/pong, errors`, 'WEBSOCKET-SERVICE');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize WebSocket service: ${error.message}`, 'WEBSOCKET-SERVICE');
      logger.error(`Stack trace: ${error.stack}`, 'WEBSOCKET-SERVICE');
      return false;
    }
  }

  /**
   * Set up Redis adapter for multi-server Socket.IO
   */
  setupRedisAdapter() {
    try {
      // Check if Redis configuration is available
      if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
        logger.warn('Redis configuration not found, running without Redis adapter', 'WEBSOCKET-SERVICE');
        logger.warn('Multi-server WebSocket communication will not work properly', 'WEBSOCKET-SERVICE');
        return;
      }

      const pubClient = new Redis({
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        username: process.env.REDIS_USERNAME || 'default',
        db: parseInt(process.env.REDIS_DB || 0),
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      });

      const subClient = pubClient.duplicate();

      // Handle Redis connection events
      pubClient.on('connect', () => {
        logger.success('Redis pub client connected for Socket.IO adapter', 'WEBSOCKET-SERVICE');
      });

      subClient.on('connect', () => {
        logger.success('Redis sub client connected for Socket.IO adapter', 'WEBSOCKET-SERVICE');
      });

      pubClient.on('error', (err) => {
        logger.error(`Redis pub client error: ${err.message}`, 'WEBSOCKET-SERVICE');
      });

      subClient.on('error', (err) => {
        logger.error(`Redis sub client error: ${err.message}`, 'WEBSOCKET-SERVICE');
      });

      // Create and attach the adapter
      this.io.adapter(createAdapter(pubClient, subClient));
      logger.success('Redis adapter configured for multi-server Socket.IO', 'WEBSOCKET-SERVICE');
      
    } catch (error) {
      logger.error(`Failed to set up Redis adapter: ${error.message}`, 'WEBSOCKET-SERVICE');
      logger.warn('Continuing without Redis adapter - multi-server sync disabled', 'WEBSOCKET-SERVICE');
    }
  }

  /**
   * Set up Socket.IO event handlers
   */
  setupEventHandlers() {
    logger.info('Setting up WebSocket event handlers...', 'WEBSOCKET-SERVICE');
    
    this.io.on('connection', (socket) => {
      logger.success(`Client connected: ${socket.id} from ${socket.handshake.address}`, 'WEBSOCKET-SERVICE');
      logger.info(`Transport: ${socket.conn.transport.name}`, 'WEBSOCKET-SERVICE');
      logger.info(`Headers: ${JSON.stringify(socket.handshake.headers['user-agent'] || 'Unknown')}`, 'WEBSOCKET-SERVICE');

      // Handle user authentication and registration
      socket.on('authenticate', (data) => {
        logger.info(`Authentication request from socket ${socket.id}`, 'WEBSOCKET-SERVICE');
        this.handleAuthentication(socket, data);
      });

      // Handle user disconnection
      socket.on('disconnect', (reason) => {
        logger.info(`Client disconnect initiated: ${socket.id}, reason: ${reason}`, 'WEBSOCKET-SERVICE');
        this.handleDisconnection(socket, reason);
      });

      // Handle notification acknowledgment
      socket.on('notification:ack', (data) => {
        logger.info(`Notification ack received from ${socket.id}`, 'WEBSOCKET-SERVICE');
        this.handleNotificationAck(socket, data);
      });

      // Handle notification read status
      socket.on('notification:markRead', (data) => {
        logger.info(`Mark as read request from ${socket.id}`, 'WEBSOCKET-SERVICE');
        this.handleMarkAsRead(socket, data);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        // Log ping at info level instead of debug (which doesn't exist)
        // logger.info(`Ping received from ${socket.id}`, 'WEBSOCKET-SERVICE');
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`Socket ${socket.id} error: ${error.message}`, 'WEBSOCKET-SERVICE');
        logger.error(`Error stack: ${error.stack}`, 'WEBSOCKET-SERVICE');
      });

      // Log transport upgrades
      socket.conn.on('upgrade', () => {
        logger.info(`Socket ${socket.id} upgraded transport to: ${socket.conn.transport.name}`, 'WEBSOCKET-SERVICE');
      });

      // Log when transport closes
      socket.conn.on('close', (reason) => {
        logger.info(`Socket ${socket.id} transport closed: ${reason}`, 'WEBSOCKET-SERVICE');
      });
    });

    // Handle server-level events
    this.io.engine.on('connection_error', (err) => {
      logger.error(`WebSocket connection error: ${err.req?.url || 'Unknown'} - ${err.message}`, 'WEBSOCKET-SERVICE');
      logger.error(`Client: ${err.req?.headers?.['user-agent'] || 'Unknown'}`, 'WEBSOCKET-SERVICE');
      if (err.code) logger.error(`Error code: ${err.code}`, 'WEBSOCKET-SERVICE');
    });

    // Log initial setup complete
    logger.success('All WebSocket event handlers registered successfully', 'WEBSOCKET-SERVICE');
  }

  /**
   * Handle user authentication
   */
  handleAuthentication(socket, data) {
    try {
      const { userId, username, sessionToken } = data;

      if (!userId) {
        socket.emit('auth:error', { message: 'User ID is required' });
        return;
      }

      // Store user connection mapping
      const connectionInfo = {
        socketId: socket.id,
        socket: socket,
        userId: parseInt(userId),
        username: username,
        sessionToken: sessionToken,
        connectedAt: new Date(),
        lastSeen: new Date()
      };

      // Check for existing connection for this user
      if (this.connectedClients.has(userId)) {
        const existingConnection = this.connectedClients.get(userId);
        
        // Only disconnect if it's a different socket (not the same connection re-authenticating)
        if (existingConnection.socketId !== socket.id) {
          logger.info(`Disconnecting previous connection for user ${userId} (socket: ${existingConnection.socketId})`, 'WEBSOCKET-SERVICE');
          if (existingConnection.socket && existingConnection.socket.connected) {
            existingConnection.socket.disconnect(true);
          }
          this.userSockets.delete(existingConnection.socketId);
        } else {
          // Same socket re-authenticating, just update the connection info
          logger.info(`User ${userId} re-authenticating on same socket ${socket.id}`, 'WEBSOCKET-SERVICE');
        }
      }

      // Store new connection
      this.connectedClients.set(userId, connectionInfo);
      this.userSockets.set(socket.id, connectionInfo);

      // Join user-specific room for targeted notifications
      socket.join(`user:${userId}`);

      // Confirm authentication
      socket.emit('auth:success', {
        userId: userId,
        username: username,
        connectedAt: connectionInfo.connectedAt
      });

      logger.success(`User ${username} (${userId}) authenticated with socket ${socket.id}`, 'WEBSOCKET-SERVICE');

      // Send any pending notifications for this user
      this.sendPendingNotifications(userId);

    } catch (error) {
      logger.error(`Authentication error for socket ${socket.id}: ${error.message}`, 'WEBSOCKET-SERVICE');
      socket.emit('auth:error', { message: 'Authentication failed' });
    }
  }

  /**
   * Handle user disconnection
   */
  handleDisconnection(socket, reason) {
    try {
      const connectionInfo = this.userSockets.get(socket.id);
      
      if (connectionInfo) {
        const { userId, username } = connectionInfo;
        
        // Remove from mappings
        this.connectedClients.delete(userId);
        this.userSockets.delete(socket.id);

        logger.info(`User ${username} (${userId}) disconnected from socket ${socket.id}. Reason: ${reason}`, 'WEBSOCKET-SERVICE');
      } else {
        logger.info(`Unauthenticated client disconnected: ${socket.id}. Reason: ${reason}`, 'WEBSOCKET-SERVICE');
      }
    } catch (error) {
      logger.error(`Error handling disconnection for socket ${socket.id}: ${error.message}`, 'WEBSOCKET-SERVICE');
    }
  }

  /**
   * Handle notification acknowledgment
   */
  handleNotificationAck(socket, data) {
    try {
      const { notificationId, received } = data;
      logger.info(`Notification ${notificationId} acknowledged by socket ${socket.id}`, 'WEBSOCKET-SERVICE');
      
      // You can update notification status here if needed
      if (received) {
        // Optional: Update notification as received in database
      }
    } catch (error) {
      logger.error(`Error handling notification ack: ${error.message}`, 'WEBSOCKET-SERVICE');
    }
  }

  /**
   * Handle marking notification as read
   */
  async handleMarkAsRead(socket, data) {
    try {
      const { notificationIds } = data;
      const connectionInfo = this.userSockets.get(socket.id);
      
      if (!connectionInfo) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const { userId } = connectionInfo;
      const InAppNotification = require('../models/inAppNotification.model');
      
      const result = await InAppNotification.markUserNotificationsAsRead(userId, notificationIds);
      
      socket.emit('notifications:markedRead', { 
        success: true, 
        updatedCount: result.modifiedCount,
        notificationIds 
      });

      logger.info(`Marked ${result.modifiedCount} notifications as read for user ${userId}`, 'WEBSOCKET-SERVICE');

    } catch (error) {
      logger.error(`Error marking notifications as read: ${error.message}`, 'WEBSOCKET-SERVICE');
      socket.emit('notifications:markedRead', { 
        success: false, 
        error: error.message 
      });
    }
  }

  /**
   * Send notification to specific user
   */
  async sendNotificationToUser(userId, notificationData) {
    try {
      if (!this.isInitialized) {
        throw new Error('WebSocket service not initialized');
      }

      const connection = this.connectedClients.get(parseInt(userId));
      
      if (!connection || !connection.socket.connected) {
        logger.warn(`User ${userId} not connected via WebSocket`, 'WEBSOCKET-SERVICE');
        return {
          success: false,
          reason: 'User not connected',
          delivery: 'failed'
        };
      }

      // Send notification to user's room
      const notificationPayload = {
        id: notificationData.id || notificationData._id,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data,
        timestamp: new Date().toISOString(),
        priority: notificationData.priority || 'normal'
      };

      // Send to user room (works across all servers with Redis adapter)
      this.io.to(`user:${userId}`).emit('notification:new', notificationPayload);
      
      // Also send directly to socket if available
      if (connection.socket.connected) {
        connection.socket.emit('notification:new', notificationPayload);
      }

      logger.success(`Sent notification ${notificationData.id} to user ${userId} via socket ${connection.socketId}`, 'WEBSOCKET-SERVICE');

      return {
        success: true,
        socketId: connection.socketId,
        userId: userId,
        delivery: 'delivered',
        deliveryMethod: 'websocket'
      };

    } catch (error) {
      logger.error(`Failed to send notification to user ${userId}: ${error.message}`, 'WEBSOCKET-SERVICE');
      return {
        success: false,
        reason: error.message,
        delivery: 'failed'
      };
    }
  }

  /**
   * Send pending notifications to a user when they connect
   */
  async sendPendingNotifications(userId) {
    try {
      const InAppNotification = require('../models/inAppNotification.model');
      
      const pendingNotifications = await InAppNotification.find({
        'recipient.userId': userId,
        status: 'pending',
        expiresAt: { $gt: new Date() }
      }).sort({ createdAt: 1 }).limit(10); // Limit to 10 most recent

      if (pendingNotifications.length > 0) {
        logger.info(`Found ${pendingNotifications.length} pending notifications for user ${userId}`, 'WEBSOCKET-SERVICE');
        
        for (const notification of pendingNotifications) {
          const result = await this.sendNotificationToUser(userId, notification);
          
          if (result.success) {
            // Mark as delivered
            await notification.markAsDelivered(result.socketId, 'websocket');
          }
        }
      }
    } catch (error) {
      logger.error(`Error sending pending notifications to user ${userId}: ${error.message}`, 'WEBSOCKET-SERVICE');
    }
  }

  /**
   * Broadcast notification to all connected users
   */
  broadcastNotification(notificationData) {
    try {
      if (!this.isInitialized) {
        logger.warn('WebSocket service not initialized, cannot broadcast', 'WEBSOCKET-SERVICE');
        return false;
      }

      this.io.emit('notification:broadcast', {
        id: notificationData.id,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        timestamp: new Date().toISOString()
      });

      logger.info(`Broadcasted notification ${notificationData.id} to all connected clients`, 'WEBSOCKET-SERVICE');
      return true;
    } catch (error) {
      logger.error(`Failed to broadcast notification: ${error.message}`, 'WEBSOCKET-SERVICE');
      return false;
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      totalConnections: this.connectedClients.size,
      authenticatedUsers: this.connectedClients.size,
      totalSockets: this.userSockets.size,
      connectedUsers: Array.from(this.connectedClients.entries()).map(([userId, info]) => ({
        userId,
        username: info.username,
        socketId: info.socketId,
        connectedAt: info.connectedAt,
        lastSeen: info.lastSeen
      }))
    };
  }

  /**
   * Check if user is connected
   */
  isUserConnected(userId) {
    const connection = this.connectedClients.get(parseInt(userId));
    return connection && connection.socket.connected;
  }

  /**
   * Disconnect user
   */
  disconnectUser(userId, reason = 'Server disconnect') {
    const connection = this.connectedClients.get(parseInt(userId));
    if (connection && connection.socket.connected) {
      connection.socket.disconnect();
      logger.info(`Disconnected user ${userId}. Reason: ${reason}`, 'WEBSOCKET-SERVICE');
      return true;
    }
    return false;
  }

  /**
   * Cleanup expired connections
   */
  cleanupConnections() {
    let cleanedCount = 0;
    
    for (const [socketId, connectionInfo] of this.userSockets.entries()) {
      if (!connectionInfo.socket.connected) {
        this.userSockets.delete(socketId);
        this.connectedClients.delete(connectionInfo.userId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} stale connections`, 'WEBSOCKET-SERVICE');
    }
    
    return cleanedCount;
  }

  /**
   * Shutdown WebSocket service
   */
  async shutdown() {
    try {
      if (this.io) {
        // Disconnect all clients
        this.io.disconnectSockets(true);
        
        // Clear mappings
        this.connectedClients.clear();
        this.userSockets.clear();
        
        this.isInitialized = false;
        logger.info('WebSocket service shutdown complete', 'WEBSOCKET-SERVICE');
      }
    } catch (error) {
      logger.error(`Error during WebSocket service shutdown: ${error.message}`, 'WEBSOCKET-SERVICE');
    }
  }
}

module.exports = new WebSocketService();