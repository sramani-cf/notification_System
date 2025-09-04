import { io } from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.currentUser = null;
    this.notificationHandlers = [];
    this.connectionHandlers = [];
    this.reconnectInterval = null;
    this.heartbeatInterval = null;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(serverUrl = 'http://localhost:8000', user = null) {
    // If already connected and authenticated with the same user, just resolve
    if (this.socket && this.socket.connected && this.isConnected && this.currentUser?.userId === user?.userId) {
      console.log('WebSocket already connected and authenticated');
      return Promise.resolve();
    }

    // If socket exists but not connected, clean it up first
    if (this.socket && !this.socket.connected) {
      console.log('Cleaning up disconnected socket');
      this.socket.removeAllListeners();
      this.socket = null;
    }

    console.log(`Attempting to connect to WebSocket server: ${serverUrl}`);
    console.log(`User provided:`, user ? `${user.username} (ID: ${user.userId})` : 'None');

    return new Promise((resolve, reject) => {
      try {
        this.socket = io(serverUrl, {
          transports: ['websocket', 'polling'], // Prioritize WebSocket for better performance
          timeout: 20000, // Increased timeout
          reconnection: true,
          reconnectionDelay: 1000, // Start with 1 second delay
          reconnectionDelayMax: 5000, // Max 5 seconds between attempts
          reconnectionAttempts: this.maxReconnectAttempts,
          forceNew: true, // Force new connection
          upgrade: true, // Allow upgrade from polling to websocket
          rememberUpgrade: true, // Remember the upgrade for reconnections
          autoConnect: true,
          query: {
            // Add timestamp to ensure unique connection
            timestamp: Date.now()
          }
        });

        console.log('WebSocket instance created, setting up event handlers...');
        this.setupEventHandlers();
        
        // Set up connection timeout
        const connectionTimeout = setTimeout(() => {
          console.error('WebSocket connection timeout after 15 seconds');
          reject(new Error('Connection timeout'));
        }, 15000);

        // Authenticate if user provided
        if (user) {
          this.currentUser = user;
          this.socket.once('connect', () => {
            clearTimeout(connectionTimeout);
            console.log('WebSocket connected, attempting authentication...');
            this.authenticate(user).then(resolve).catch(reject);
          });
        } else {
          this.socket.once('connect', () => {
            clearTimeout(connectionTimeout);
            console.log('WebSocket connected without authentication');
            resolve();
          });
        }

        this.socket.once('connect_error', (error) => {
          clearTimeout(connectionTimeout);
          console.error('WebSocket connection error:', error);
          reject(error);
        });

      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  /**
   * Authenticate user with the WebSocket server
   */
  authenticate(user) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Socket not connected'));
        return;
      }

      // Check if already authenticated with the same user
      if (this.isConnected && this.currentUser?.userId === user.userId) {
        console.log('Already authenticated with this user');
        resolve({ userId: user.userId, username: user.username });
        return;
      }

      this.currentUser = user;
      
      // Set up timeout before setting listeners
      const authTimeout = setTimeout(() => {
        // Clean up listeners
        this.socket.off('auth:success');
        this.socket.off('auth:error');
        reject(new Error('Authentication timeout'));
      }, 10000);
      
      // Set up success handler
      const successHandler = (data) => {
        clearTimeout(authTimeout);
        console.log('WebSocket authentication successful:', data);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        resolve(data);
      };
      
      // Set up error handler
      const errorHandler = (error) => {
        clearTimeout(authTimeout);
        console.error('WebSocket authentication failed:', error);
        this.isConnected = false;
        reject(new Error(error.message || 'Authentication failed'));
      };
      
      // Use once to auto-remove listeners after firing
      this.socket.once('auth:success', successHandler);
      this.socket.once('auth:error', errorHandler);
      
      // Emit authentication request
      this.socket.emit('authenticate', {
        userId: user.userId,
        username: user.username,
        sessionToken: user.sessionToken
      });
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('WebSocket connected:', this.socket.id);
      console.log('Transport:', this.socket.io.engine.transport.name);
      this.notifyConnectionHandlers('connected');
      
      // Re-authenticate if we have user info and socket is connected
      if (this.currentUser && !this.isConnected && this.socket && this.socket.connected) {
        // Small delay to ensure socket is fully ready
        setTimeout(() => {
          if (this.socket && this.socket.connected) {
            this.authenticate(this.currentUser).catch(error => {
              console.error('Re-authentication failed:', error);
            });
          }
        }, 100);
      }
    });

    // Log transport upgrades
    this.socket.io.on('upgrade', (transport) => {
      console.log('Transport upgraded to:', transport.name);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnected = false;
      this.stopHeartbeat();
      this.notifyConnectionHandlers('disconnected', reason);
      
      // Only attempt reconnect for certain disconnect reasons
      const reconnectableReasons = ['io server disconnect', 'transport close', 'transport error', 'ping timeout'];
      
      if (reconnectableReasons.includes(reason)) {
        console.log(`Disconnect reason '${reason}' is reconnectable, attempting reconnect...`);
        this.handleReconnect();
      } else if (reason === 'io client disconnect') {
        // Client intentionally disconnected, don't reconnect
        console.log('Client initiated disconnect, not reconnecting');
      } else {
        console.log(`Disconnect reason '${reason}', will not auto-reconnect`);
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.isConnected = false;
      this.notifyConnectionHandlers('error', error);
      this.handleReconnect();
    });

    // Notification events
    this.socket.on('notification:new', (notification) => {
      console.log('Received new notification:', notification);
      this.handleIncomingNotification(notification);
    });

    this.socket.on('notification:broadcast', (notification) => {
      console.log('Received broadcast notification:', notification);
      this.handleIncomingNotification(notification);
    });

    // Response events
    this.socket.on('notifications:markedRead', (response) => {
      console.log('Notifications marked as read:', response);
    });

    // Heartbeat events
    this.socket.on('pong', (data) => {
      // Received pong response
      console.debug('Heartbeat pong received');
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  /**
   * Handle incoming notifications
   */
  handleIncomingNotification(notification) {
    // Add timestamp if not present
    if (!notification.receivedAt) {
      notification.receivedAt = new Date().toISOString();
    }

    // Send acknowledgment
    this.acknowledgeNotification(notification.id);

    // Notify all registered handlers
    this.notificationHandlers.forEach(handler => {
      try {
        handler(notification);
      } catch (error) {
        console.error('Error in notification handler:', error);
      }
    });

    // Show browser notification if supported and permission granted
    this.showBrowserNotification(notification);
  }

  /**
   * Acknowledge notification receipt
   */
  acknowledgeNotification(notificationId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('notification:ack', {
        notificationId: notificationId,
        received: true,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Mark notifications as read
   */
  markNotificationsAsRead(notificationIds) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('notification:markRead', {
        notificationIds: notificationIds
      });
    }
  }

  /**
   * Show browser notification
   */
  showBrowserNotification(notification) {
    // Check if browser notifications are supported and permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const browserNotification = new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: notification.id,
          requireInteraction: notification.priority === 'high' || notification.priority === 'urgent',
          silent: notification.priority === 'low'
        });

        browserNotification.onclick = () => {
          window.focus();
          browserNotification.close();
        };

        // Auto-close after 5 seconds unless it requires interaction
        if (!browserNotification.requireInteraction) {
          setTimeout(() => {
            browserNotification.close();
          }, 5000);
        }
      } catch (error) {
        console.error('Failed to show browser notification:', error);
      }
    }
  }

  /**
   * Request browser notification permission
   */
  async requestNotificationPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  /**
   * Handle reconnection attempts
   */
  handleReconnect() {
    // Don't reconnect if already connected or connecting
    if (this.socket && this.socket.connected) {
      console.log('Already connected, skipping reconnect');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.notifyConnectionHandlers('max_reconnect_attempts');
      return;
    }

    // Clear any existing reconnect timer
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 5000); // Exponential backoff, max 5s
    
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
    
    this.reconnectInterval = setTimeout(() => {
      if (!this.socket || !this.socket.connected) {
        // Clear old socket and create new connection
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.disconnect();
          this.socket = null;
        }
        // Reconnect with the same server URL and user info
        this.connect('http://localhost:8000', this.currentUser).catch(error => {
          console.error('Reconnection attempt failed:', error);
        });
      }
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    this.stopHeartbeat(); // Clear any existing interval
    
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit('ping');
      }
    }, 30000); // Send ping every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Add notification handler
   */
  addNotificationHandler(handler) {
    if (typeof handler === 'function') {
      this.notificationHandlers.push(handler);
    }
  }

  /**
   * Remove notification handler
   */
  removeNotificationHandler(handler) {
    const index = this.notificationHandlers.indexOf(handler);
    if (index !== -1) {
      this.notificationHandlers.splice(index, 1);
    }
  }

  /**
   * Add connection handler
   */
  addConnectionHandler(handler) {
    if (typeof handler === 'function') {
      this.connectionHandlers.push(handler);
    }
  }

  /**
   * Remove connection handler
   */
  removeConnectionHandler(handler) {
    const index = this.connectionHandlers.indexOf(handler);
    if (index !== -1) {
      this.connectionHandlers.splice(index, 1);
    }
  }

  /**
   * Notify connection handlers
   */
  notifyConnectionHandlers(status, data = null) {
    this.connectionHandlers.forEach(handler => {
      try {
        handler(status, data);
      } catch (error) {
        console.error('Error in connection handler:', error);
      }
    });
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      socketConnected: this.socket?.connected || false,
      socketId: this.socket?.id || null,
      reconnectAttempts: this.reconnectAttempts,
      currentUser: this.currentUser
    };
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    try {
      this.isConnected = false;
      this.currentUser = null;
      this.stopHeartbeat();
      
      if (this.reconnectInterval) {
        clearTimeout(this.reconnectInterval);
        this.reconnectInterval = null;
      }
      
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      
      console.log('WebSocket disconnected');
    } catch (error) {
      console.error('Error during WebSocket disconnect:', error);
    }
  }
}

// Create singleton instance
const websocketService = new WebSocketService();

export default websocketService;