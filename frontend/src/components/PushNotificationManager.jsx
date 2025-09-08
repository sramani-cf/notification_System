'use client';

import React, { useState, useEffect } from 'react';
import fcmService from '@/services/fcmService';
import { Bell, BellOff, RefreshCw, Check, X, AlertCircle } from 'lucide-react';

const PushNotificationManager = ({ userId }) => {
  const [permissionStatus, setPermissionStatus] = useState('default');
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    checkPermissionStatus();
    const storedToken = localStorage.getItem('fcmToken');
    if (storedToken) {
      setToken(storedToken);
      setIsInitialized(true);
    }
  }, []);

  const checkPermissionStatus = () => {
    const status = fcmService.getPermissionStatus();
    setPermissionStatus(status);
  };

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const success = await fcmService.initialize(userId);
      
      if (success) {
        setIsInitialized(true);
        setPermissionStatus('granted');
        const currentToken = localStorage.getItem('fcmToken');
        setToken(currentToken);
      } else {
        setError('Failed to initialize push notifications');
        checkPermissionStatus();
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
      console.error('Push notification error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await fcmService.deleteToken();
      setIsInitialized(false);
      setToken(null);
      setPermissionStatus('default');
    } catch (err) {
      setError(err.message || 'Failed to disable notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshToken = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await fcmService.refreshToken(userId);
      const newToken = localStorage.getItem('fcmToken');
      setToken(newToken);
    } catch (err) {
      setError(err.message || 'Failed to refresh token');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (permissionStatus) {
      case 'granted':
        return 'text-green-600 bg-green-100';
      case 'denied':
        return 'text-red-600 bg-red-100';
      case 'default':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = () => {
    switch (permissionStatus) {
      case 'granted':
        return <Check className="w-4 h-4" />;
      case 'denied':
        return <X className="w-4 h-4" />;
      case 'default':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Push Notifications
        </h3>
        <div className={`px-3 py-1 rounded-full flex items-center gap-1 text-sm ${getStatusColor()}`}>
          {getStatusIcon()}
          <span className="capitalize">{permissionStatus}</span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {permissionStatus === 'unsupported' ? (
          <div className="text-gray-600 dark:text-gray-400">
            Push notifications are not supported in this browser.
          </div>
        ) : permissionStatus === 'denied' ? (
          <div className="space-y-2">
            <p className="text-gray-600 dark:text-gray-400">
              Push notifications are blocked. Please enable them in your browser settings.
            </p>
            <p className="text-sm text-gray-500">
              1. Click the lock icon in the address bar<br />
              2. Find "Notifications" and set to "Allow"<br />
              3. Refresh the page
            </p>
          </div>
        ) : (
          <>
            {!isInitialized ? (
              <div className="space-y-3">
                <p className="text-gray-600 dark:text-gray-400">
                  Enable push notifications to receive real-time updates about your purchases and activities.
                </p>
                <button
                  onClick={handleEnableNotifications}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                  {isLoading ? 'Enabling...' : 'Enable Push Notifications'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-600" />
                    <span className="text-green-700 dark:text-green-400">
                      Push notifications are enabled
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleRefreshToken}
                    disabled={isLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh Token
                  </button>
                  <button
                    onClick={handleDisableNotifications}
                    disabled={isLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <BellOff className="w-4 h-4" />
                    Disable
                  </button>
                </div>

                <button
                  onClick={() => setShowDebug(!showDebug)}
                  className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {showDebug ? 'Hide' : 'Show'} Debug Info
                </button>

                {showDebug && token && (
                  <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs font-mono">
                    <div className="mb-2">
                      <strong>Status:</strong> {permissionStatus}
                    </div>
                    <div className="mb-2">
                      <strong>Token (first 20 chars):</strong> {token.substring(0, 20)}...
                    </div>
                    <div>
                      <strong>Token Age:</strong> {
                        localStorage.getItem('fcmTokenTimestamp') 
                          ? `${Math.floor((Date.now() - parseInt(localStorage.getItem('fcmTokenTimestamp'))) / 1000 / 60)} minutes`
                          : 'Unknown'
                      }
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PushNotificationManager;