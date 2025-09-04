'use client';

import { useState, useEffect } from 'react';

const NotificationToast = ({ notification, onDismiss, onMarkAsRead, autoHideDuration = 5000 }) => {
  const [isVisible, setIsVisible] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(autoHideDuration / 1000);

  useEffect(() => {
    if (!notification) return;

    // Auto-hide timer
    let hideTimer;
    let countdownTimer;

    if (autoHideDuration > 0 && notification.priority !== 'urgent') {
      hideTimer = setTimeout(() => {
        handleDismiss();
      }, autoHideDuration);

      // Update countdown every second
      countdownTimer = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;
          return newTime <= 0 ? 0 : newTime;
        });
      }, 1000);
    }

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      if (countdownTimer) clearInterval(countdownTimer);
    };
  }, [notification, autoHideDuration]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      if (onDismiss) onDismiss(notification.id);
    }, 300); // Wait for fade out animation
  };

  const handleMarkAsRead = () => {
    if (onMarkAsRead) {
      onMarkAsRead([notification.id]);
    }
    handleDismiss();
  };

  if (!notification || !isVisible) return null;

  const getPriorityStyles = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'border-red-500 bg-red-50 text-red-900';
      case 'high':
        return 'border-orange-500 bg-orange-50 text-orange-900';
      case 'normal':
        return 'border-blue-500 bg-blue-50 text-blue-900';
      case 'low':
        return 'border-gray-500 bg-gray-50 text-gray-900';
      default:
        return 'border-blue-500 bg-blue-50 text-blue-900';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'login':
        return '🔐';
      case 'signup':
        return '👋';
      case 'reset_password':
        return '🔑';
      case 'purchase':
        return '💳';
      case 'friend_request':
        return '👥';
      default:
        return '🔔';
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString();
  };

  const priorityStyles = getPriorityStyles(notification.priority);
  const typeIcon = getTypeIcon(notification.type);

  return (
    <div
      className={`
        fixed top-4 right-4 max-w-md w-full bg-white border-l-4 rounded-lg shadow-lg z-50
        transform transition-all duration-300 ease-in-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${priorityStyles}
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center">
            <span className="text-xl mr-2" aria-label={`${notification.type} notification`}>
              {typeIcon}
            </span>
            <h4 className="font-semibold text-sm">
              {notification.title}
            </h4>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss notification"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-gray-700 mb-3">
          {notification.message}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-2">
            <span>{formatTimestamp(notification.timestamp)}</span>
            {notification.priority && notification.priority !== 'normal' && (
              <span className="px-2 py-1 rounded-full bg-gray-200 text-gray-700 uppercase font-semibold">
                {notification.priority}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2">
            {!notification.isRead && (
              <button
                onClick={handleMarkAsRead}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                Mark as read
              </button>
            )}
            
            {autoHideDuration > 0 && notification.priority !== 'urgent' && timeRemaining > 0 && (
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-blue-500 animate-spin"></div>
                <span>{timeRemaining}s</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress bar for auto-hide */}
        {autoHideDuration > 0 && notification.priority !== 'urgent' && (
          <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${((autoHideDuration / 1000) - timeRemaining) / (autoHideDuration / 1000) * 100}%`
              }}
            ></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationToast;