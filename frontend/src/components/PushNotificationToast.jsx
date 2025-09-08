'use client';

import React, { useState, useEffect } from 'react';
import { X, Bell, ShoppingCart, Users, Lock, Key } from 'lucide-react';

const PushNotificationToast = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Listen for push notification events
    const handlePushNotification = (event) => {
      const notification = event.detail;
      addNotification(notification);
    };

    window.addEventListener('push-notification', handlePushNotification);

    return () => {
      window.removeEventListener('push-notification', handlePushNotification);
    };
  }, []);

  const addNotification = (notification) => {
    const id = notification.id || Date.now().toString();
    const newNotification = {
      ...notification,
      id,
      isVisible: true
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      dismissNotification(id);
    }, 5000);
  };

  const dismissNotification = (id) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isVisible: false } : n)
    );

    // Remove from DOM after animation
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 300);
  };

  const getIcon = (type) => {
    switch (type) {
      case 'purchase':
        return <ShoppingCart className="w-5 h-5" />;
      case 'friend_request':
        return <Users className="w-5 h-5" />;
      case 'login':
        return <Lock className="w-5 h-5" />;
      case 'reset_password':
        return <Key className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'purchase':
        return 'bg-purple-500';
      case 'friend_request':
        return 'bg-indigo-500';
      case 'login':
        return 'bg-blue-500';
      case 'reset_password':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const handleClick = (notification) => {
    if (notification.data?.clickAction) {
      window.location.href = notification.data.clickAction;
    }
    dismissNotification(notification.id);
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`transform transition-all duration-300 ${
            notification.isVisible 
              ? 'translate-x-0 opacity-100' 
              : 'translate-x-full opacity-0'
          }`}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
            onClick={() => handleClick(notification)}
          >
            <div className="flex items-start p-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-full ${getTypeColor(notification.type)} flex items-center justify-center text-white`}>
                {getIcon(notification.type)}
              </div>
              
              <div className="ml-3 flex-1">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {notification.title}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      {notification.body}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissNotification(notification.id);
                    }}
                    className="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                {notification.image && (
                  <img
                    src={notification.image}
                    alt=""
                    className="mt-2 rounded-md w-full h-32 object-cover"
                  />
                )}
                
                <div className="mt-2 flex items-center text-xs text-gray-500 dark:text-gray-400">
                  <span>Just now</span>
                  {notification.data?.clickAction && (
                    <>
                      <span className="mx-1">•</span>
                      <span>Click to view</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className={`h-1 ${getTypeColor(notification.type)} opacity-20`} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default PushNotificationToast;