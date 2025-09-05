'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useLiveViewWebSocket({
  onRequestNew,
  onRequestProgress,
  onRequestComplete,
  onRequestFailed,
  onSystemMetrics,
  onComponentMetrics,
  onConnect,
  onDisconnect,
  onError
} = {}) {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastEvent, setLastEvent] = useState(null);
  const [eventCount, setEventCount] = useState(0);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = useRef(1000);

  // WebSocket server URL - adjust based on your backend configuration
  const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000';

  const connect = useCallback(() => {
    if (socket?.connected) return;

    console.log('Connecting to WebSocket:', SOCKET_URL);
    setConnectionStatus('connecting');

    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true
    });

    // Connection events
    newSocket.on('connect', () => {
      console.log('WebSocket connected:', newSocket.id);
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
      reconnectDelay.current = 1000;
      
      // Join the live-view room for real-time updates
      newSocket.emit('join', 'live-view');
      
      onConnect?.(newSocket);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnectionStatus('disconnected');
      onDisconnect?.(reason);

      // Auto-reconnect with exponential backoff
      if (reason !== 'io client disconnect' && reconnectAttempts.current < maxReconnectAttempts) {
        setTimeout(() => {
          reconnectAttempts.current++;
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
          connect();
        }, reconnectDelay.current);
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setConnectionStatus('error');
      onError?.(error);
    });

    // Live View specific events
    newSocket.on('request:new', (data) => {
      console.log('New request received:', data);
      setLastEvent({ type: 'request:new', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
      onRequestNew?.(data);
    });

    newSocket.on('request:progress', (data) => {
      console.log('Request progress:', data);
      setLastEvent({ type: 'request:progress', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
      onRequestProgress?.(data);
    });

    newSocket.on('request:complete', (data) => {
      console.log('Request completed:', data);
      setLastEvent({ type: 'request:complete', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
      onRequestComplete?.(data);
    });

    newSocket.on('request:failed', (data) => {
      console.log('Request failed:', data);
      setLastEvent({ type: 'request:failed', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
      onRequestFailed?.(data);
    });

    newSocket.on('system:metrics', (data) => {
      console.log('System metrics updated:', data);
      setLastEvent({ type: 'system:metrics', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
      onSystemMetrics?.(data);
    });

    newSocket.on('component:metrics', (data) => {
      console.log('Component metrics updated:', data);
      setLastEvent({ type: 'component:metrics', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
      onComponentMetrics?.(data);
    });

    // Queue events
    newSocket.on('queue:job:added', (data) => {
      console.log('Queue job added:', data);
      setLastEvent({ type: 'queue:job:added', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
    });

    newSocket.on('queue:job:processing', (data) => {
      console.log('Queue job processing:', data);
      setLastEvent({ type: 'queue:job:processing', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
    });

    newSocket.on('queue:job:completed', (data) => {
      console.log('Queue job completed:', data);
      setLastEvent({ type: 'queue:job:completed', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
    });

    newSocket.on('queue:job:failed', (data) => {
      console.log('Queue job failed:', data);
      setLastEvent({ type: 'queue:job:failed', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
    });

    // Worker events
    newSocket.on('worker:processing', (data) => {
      console.log('Worker processing:', data);
      setLastEvent({ type: 'worker:processing', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
    });

    newSocket.on('worker:idle', (data) => {
      console.log('Worker idle:', data);
      setLastEvent({ type: 'worker:idle', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
    });

    // Notification delivery events
    newSocket.on('notification:email:sent', (data) => {
      console.log('Email sent:', data);
      setLastEvent({ type: 'notification:email:sent', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
    });

    newSocket.on('notification:inapp:delivered', (data) => {
      console.log('In-app notification delivered:', data);
      setLastEvent({ type: 'notification:inapp:delivered', data, timestamp: new Date() });
      setEventCount(prev => prev + 1);
    });

    setSocket(newSocket);
  }, [SOCKET_URL, onRequestNew, onRequestProgress, onRequestComplete, onRequestFailed, onSystemMetrics, onComponentMetrics, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setConnectionStatus('disconnected');
    }
  }, [socket]);

  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(connect, 1000);
  }, [disconnect, connect]);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // Emit custom events
  const emit = useCallback((event, data) => {
    if (socket?.connected) {
      socket.emit(event, data);
      return true;
    }
    return false;
  }, [socket]);

  // Join a specific room
  const joinRoom = useCallback((room) => {
    return emit('join', room);
  }, [emit]);

  // Leave a specific room
  const leaveRoom = useCallback((room) => {
    return emit('leave', room);
  }, [emit]);

  // Subscribe to specific events
  const subscribe = useCallback((events) => {
    return emit('subscribe', events);
  }, [emit]);

  // Unsubscribe from events
  const unsubscribe = useCallback((events) => {
    return emit('unsubscribe', events);
  }, [emit]);

  // Send ping to test connection
  const ping = useCallback(() => {
    if (socket?.connected) {
      const startTime = Date.now();
      socket.emit('ping', startTime);
      
      socket.once('pong', (data) => {
        const latency = Date.now() - startTime;
        console.log('WebSocket latency:', latency + 'ms');
        return latency;
      });
      
      return true;
    }
    return false;
  }, [socket]);

  // Get connection statistics
  const getConnectionInfo = useCallback(() => {
    if (!socket) return null;
    
    return {
      id: socket.id,
      connected: socket.connected,
      transport: socket.io.engine.transport.name,
      upgradeTimeout: socket.io.engine.upgradeTimeout,
      pingInterval: socket.io.engine.pingInterval,
      pingTimeout: socket.io.engine.pingTimeout
    };
  }, [socket]);

  // Clear event history
  const clearEvents = useCallback(() => {
    setLastEvent(null);
    setEventCount(0);
  }, []);

  return {
    socket,
    connectionStatus,
    lastEvent,
    eventCount,
    connect,
    disconnect,
    reconnect,
    emit,
    joinRoom,
    leaveRoom,
    subscribe,
    unsubscribe,
    ping,
    getConnectionInfo,
    clearEvents,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting',
    hasError: connectionStatus === 'error'
  };
}