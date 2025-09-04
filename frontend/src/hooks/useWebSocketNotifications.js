'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import websocketService from '@/services/websocketService';

export const useWebSocketNotifications = (user = null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const notificationHandlerRef = useRef(null);
  const connectionHandlerRef = useRef(null);
  const maxNotifications = 50; // Keep last 50 notifications in memory

  // Connection handler
  const handleConnectionChange = useCallback((status, data = null) => {
    console.log('Connection status changed:', status, data);
    setConnectionStatus(status);
    
    switch (status) {
      case 'connected':
        setIsConnected(true);
        setError(null);
        setIsConnecting(false);
        break;
      case 'disconnected':
        setIsConnected(false);
        setIsConnecting(false);
        break;
      case 'error':
        setIsConnected(false);
        setError(data?.message || 'Connection error');
        setIsConnecting(false);
        break;
      case 'max_reconnect_attempts':
        setIsConnected(false);
        setError('Failed to reconnect after multiple attempts');
        setIsConnecting(false);
        break;
      default:
        break;
    }
  }, []);

  // Notification handler
  const handleNewNotification = useCallback((notification) => {
    console.log('New notification received:', notification);
    
    // Add a unique timestamp to make each notification instance unique
    const uniqueNotification = {
      ...notification,
      instanceId: `${notification.id}-${Date.now()}`, // Unique instance ID
      receivedAt: new Date().toISOString()
    };
    
    setNotifications(prev => {
      // Add new notification at the beginning and limit to maxNotifications
      const updated = [uniqueNotification, ...prev].slice(0, maxNotifications);
      return updated;
    });
    
    // Increment unread count for new notifications
    if (!notification.isRead) {
      setUnreadCount(prev => prev + 1);
    }
    
    // Optional: Play notification sound
    if (notification.priority === 'high' || notification.priority === 'urgent') {
      playNotificationSound();
    }
  }, []);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      // Create audio element and play sound
      const audio = new Audio('/notification-sound.mp3');
      audio.volume = 0.3;
      audio.play().catch(e => console.log('Could not play notification sound:', e));
    } catch (error) {
      console.log('Notification sound not available');
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(async (serverUrl = 'http://localhost:8000') => {
    if (isConnecting || isConnected) {
      console.log('Already connecting or connected');
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      
      await websocketService.connect(serverUrl, user);
      console.log('WebSocket connected successfully');
      
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      setError(error.message);
      setIsConnecting(false);
    }
  }, [user, isConnecting, isConnected]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    websocketService.disconnect();
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setError(null);
    setIsConnecting(false);
  }, []);

  // Mark notifications as read
  const markAsRead = useCallback((notificationIds = null) => {
    if (!isConnected) return;
    
    // If no specific IDs provided, mark all as read
    const idsToMark = notificationIds || notifications
      .filter(n => !n.isRead)
      .map(n => n.id);
    
    if (idsToMark.length > 0) {
      websocketService.markNotificationsAsRead(idsToMark);
      
      // Update local state
      setNotifications(prev => 
        prev.map(notification => 
          idsToMark.includes(notification.id) 
            ? { ...notification, isRead: true, readAt: new Date().toISOString() }
            : notification
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - idsToMark.length));
    }
  }, [isConnected, notifications]);

  // Clear all notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Clear a specific notification
  const clearNotification = useCallback((notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setUnreadCount(prev => {
      const notification = notifications.find(n => n.id === notificationId);
      return notification && !notification.isRead ? Math.max(0, prev - 1) : prev;
    });
  }, [notifications]);

  // Request browser notification permission
  const requestNotificationPermission = useCallback(async () => {
    return await websocketService.requestNotificationPermission();
  }, []);

  // Get connection info
  const getConnectionInfo = useCallback(() => {
    return websocketService.getConnectionStatus();
  }, []);

  // Setup event handlers
  useEffect(() => {
    // Create handler functions
    notificationHandlerRef.current = handleNewNotification;
    connectionHandlerRef.current = handleConnectionChange;
    
    // Add handlers
    websocketService.addNotificationHandler(notificationHandlerRef.current);
    websocketService.addConnectionHandler(connectionHandlerRef.current);
    
    // Cleanup function
    return () => {
      if (notificationHandlerRef.current) {
        websocketService.removeNotificationHandler(notificationHandlerRef.current);
      }
      if (connectionHandlerRef.current) {
        websocketService.removeConnectionHandler(connectionHandlerRef.current);
      }
    };
  }, [handleNewNotification, handleConnectionChange]);

  // Auto-connect if user is provided
  useEffect(() => {
    if (user && user.userId && !isConnected && !isConnecting) {
      connect();
    }
  }, [user, isConnected, isConnecting, connect]);

  // Auto-disconnect on unmount or user change
  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnect();
      }
    };
  }, []);

  return {
    // Connection state
    isConnected,
    isConnecting,
    connectionStatus,
    error,
    
    // Notifications
    notifications,
    unreadCount,
    
    // Actions
    connect,
    disconnect,
    markAsRead,
    clearNotifications,
    clearNotification,
    requestNotificationPermission,
    getConnectionInfo,
    
    // Computed values
    hasUnread: unreadCount > 0,
    latestNotification: notifications[0] || null,
    readNotifications: notifications.filter(n => n.isRead),
    unreadNotifications: notifications.filter(n => !n.isRead)
  };
};