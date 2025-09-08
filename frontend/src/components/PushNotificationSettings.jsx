'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Bell, ShoppingCart, Users, Lock, Key, Mail, Megaphone, Save } from 'lucide-react';
import api from '@/services/api';

const PushNotificationSettings = ({ userId }) => {
  const [permissions, setPermissions] = useState({
    notifications: true,
    purchase: true,
    friendRequest: true,
    login: true,
    resetPassword: true,
    marketing: false
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('fcmToken');
    if (storedToken) {
      setToken(storedToken);
      fetchCurrentSettings(storedToken);
    }
  }, []);

  const fetchCurrentSettings = async (fcmToken) => {
    try {
      const response = await api.get(`/api/fcm-tokens/${encodeURIComponent(fcmToken)}`);
      if (response.data?.permissions) {
        setPermissions(response.data.permissions);
      }
    } catch (error) {
      console.error('Failed to fetch current settings:', error);
    }
  };

  const handleToggle = (key) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!token) {
      console.error('No FCM token found');
      return;
    }

    setLoading(true);
    try {
      await api.patch(`/api/fcm-tokens/${encodeURIComponent(token)}/permissions`, {
        permissions
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const notificationTypes = [
    {
      key: 'purchase',
      label: 'Purchase Notifications',
      description: 'Get notified when you make a purchase',
      icon: <ShoppingCart className="w-5 h-5" />,
      color: 'text-purple-600'
    },
    {
      key: 'friendRequest',
      label: 'Friend Requests',
      description: 'Receive notifications for friend requests',
      icon: <Users className="w-5 h-5" />,
      color: 'text-indigo-600'
    },
    {
      key: 'login',
      label: 'Login Alerts',
      description: 'Get notified of new login attempts',
      icon: <Lock className="w-5 h-5" />,
      color: 'text-blue-600'
    },
    {
      key: 'resetPassword',
      label: 'Password Reset',
      description: 'Receive password reset notifications',
      icon: <Key className="w-5 h-5" />,
      color: 'text-yellow-600'
    },
    {
      key: 'marketing',
      label: 'Marketing & Promotions',
      description: 'Receive promotional offers and updates',
      icon: <Megaphone className="w-5 h-5" />,
      color: 'text-pink-600'
    }
  ];

  if (!token) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Push Notification Settings
          </h3>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Please enable push notifications first to customize your settings.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Push Notification Settings
          </h3>
        </div>
        {saved && (
          <div className="flex items-center gap-2 text-green-600">
            <Save className="w-4 h-4" />
            <span className="text-sm">Saved!</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {/* Master Toggle */}
        <div className="pb-4 border-b dark:border-gray-700">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  All Notifications
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Enable or disable all push notifications
                </div>
              </div>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={permissions.notifications}
                onChange={() => handleToggle('notifications')}
                className="sr-only"
              />
              <div className={`block w-14 h-8 rounded-full transition-colors ${
                permissions.notifications ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
              }`} />
              <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${
                permissions.notifications ? 'translate-x-6' : ''
              }`} />
            </div>
          </label>
        </div>

        {/* Individual Notification Types */}
        {permissions.notifications && (
          <div className="space-y-4 pt-2">
            {notificationTypes.map((type) => (
              <label key={type.key} className="flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className={type.color}>
                    {type.icon}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {type.label}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {type.description}
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={permissions[type.key]}
                    onChange={() => handleToggle(type.key)}
                    className="sr-only"
                  />
                  <div className={`block w-14 h-8 rounded-full transition-colors ${
                    permissions[type.key] ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`} />
                  <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${
                    permissions[type.key] ? 'translate-x-6' : ''
                  }`} />
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="mt-6 pt-4 border-t dark:border-gray-700">
        <button
          onClick={handleSave}
          disabled={loading || saved}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default PushNotificationSettings;