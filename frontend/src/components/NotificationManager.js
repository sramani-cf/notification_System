'use client';

import { useState, useEffect } from 'react';
import { useWebSocketNotifications } from '@/hooks/useWebSocketNotifications';
import NotificationToast from './NotificationToast';

const NotificationManager = ({ user = null, maxVisible = 3 }) => {
  const {
    isConnected,
    isConnecting,
    connectionStatus,
    notifications,
    unreadCount,
    error,
    markAsRead,
    clearNotification,
    requestNotificationPermission,
    connect,
    disconnect
  } = useWebSocketNotifications(user);

  const [visibleToasts, setVisibleToasts] = useState([]);
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false);

  // Request browser notification permission on first connection
  useEffect(() => {
    if (isConnected && !hasRequestedPermission) {
      requestNotificationPermission().then(() => {
        setHasRequestedPermission(true);
      });
    }
  }, [isConnected, hasRequestedPermission, requestNotificationPermission]);

  // Show new notifications as toasts
  useEffect(() => {
    if (notifications.length > 0) {
      setVisibleToasts(prev => {
        // Get the most recent notifications that aren't already visible
        const newNotifications = notifications
          .filter(notification => 
            !prev.some(toast => toast.instanceId === notification.instanceId) &&
            !notification.isRead
          )
          .slice(0, maxVisible - prev.length);

        if (newNotifications.length > 0) {
          // Add new notifications and limit to maxVisible
          return [...newNotifications, ...prev].slice(0, maxVisible);
        }
        return prev;
      });
    }
  }, [notifications, maxVisible]);

  const handleDismissToast = (notificationInstanceId) => {
    setVisibleToasts(prev => prev.filter(toast => toast.instanceId !== notificationInstanceId));
  };

  const handleMarkAsRead = (notificationIds) => {
    markAsRead(notificationIds);
    // Remove from visible toasts
    setVisibleToasts(prev => 
      prev.filter(toast => !notificationIds.includes(toast.id))
    );
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-500';
      case 'connecting':
      case 'disconnected':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  const getConnectionStatusText = () => {
    if (isConnecting) return 'Connecting...';
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'error':
        return 'Connection Error';
      default:
        return 'Not Connected';
    }
  };

  return (
    <>
      {/* Connection Status Indicator */}
      {user && (
        <div className="fixed top-4 left-4 z-40">
          <div className={`
            flex items-center space-x-2 px-3 py-2 rounded-lg shadow-sm
            ${isConnected ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}
          `}>
            <div className={`w-2 h-2 rounded-full ${
              isConnected 
                ? 'bg-green-500 animate-pulse' 
                : isConnecting 
                  ? 'bg-yellow-500 animate-spin border border-yellow-700' 
                  : 'bg-red-500'
            }`}></div>
            <span className={`text-xs font-medium ${getConnectionStatusColor()}`}>
              {getConnectionStatusText()}
            </span>
            {unreadCount > 0 && (
              <span className="bg-blue-500 text-white text-xs rounded-full px-2 py-1 min-w-[1.25rem] text-center">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm">{error}</span>
              <button
                onClick={() => window.location.reload()}
                className="ml-4 text-red-700 hover:text-red-900 text-sm underline"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connection Controls (for development/testing) */}
      {process.env.NODE_ENV === 'development' && user && (
        <div className="fixed bottom-4 left-4 z-40">
          <div className="bg-white border rounded-lg shadow-lg p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-700">WebSocket Controls</div>
            <div className="flex space-x-2">
              <button
                onClick={() => connect()}
                disabled={isConnected || isConnecting}
                className="text-xs px-2 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300"
              >
                Connect
              </button>
              <button
                onClick={() => disconnect()}
                disabled={!isConnected}
                className="text-xs px-2 py-1 bg-red-500 text-white rounded disabled:bg-gray-300"
              >
                Disconnect
              </button>
            </div>
            <div className="text-xs text-gray-500">
              Notifications: {notifications.length} | Unread: {unreadCount}
            </div>
          </div>
        </div>
      )}

      {/* Notification Toasts Container */}
      <div className="fixed top-20 right-4 z-50 pointer-events-none">
        <div className="flex flex-col gap-3 pointer-events-auto">
          {visibleToasts.map((notification, index) => (
            <div 
              key={`toast-${notification.instanceId || notification.id}-${index}`}
              style={{ 
                animationDelay: `${index * 100}ms`,
                zIndex: 50 - index 
              }}
              className="animate-slide-in-right"
            >
              <NotificationToast
                notification={notification}
                onDismiss={handleDismissToast}
                onMarkAsRead={handleMarkAsRead}
                autoHideDuration={notification.priority === 'urgent' ? 0 : 5000}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Notification History Panel (Hidden by default, can be toggled) */}
      {process.env.NODE_ENV === 'development' && notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40">
          <details className="bg-white border rounded-lg shadow-lg">
            <summary className="p-3 cursor-pointer text-sm font-semibold text-gray-700">
              Notification History ({notifications.length})
            </summary>
            <div className="p-3 border-t max-h-64 overflow-y-auto">
              <div className="space-y-2">
                {notifications.slice(0, 10).map((notification, idx) => (
                  <div key={`history-${notification.instanceId || notification.id}-${idx}`} className="text-xs border-b pb-2">
                    <div className="font-medium">{notification.title}</div>
                    <div className="text-gray-600 truncate">{notification.message}</div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-gray-500">
                        {new Date(notification.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`px-1 py-0.5 rounded text-xs ${
                        notification.isRead ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {notification.isRead ? 'Read' : 'Unread'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      )}
    </>
  );
};

export default NotificationManager;