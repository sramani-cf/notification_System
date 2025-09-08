'use client';

import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle, XCircle, Clock, ExternalLink, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import api from '@/services/api';

const PushNotificationHistory = ({ userId, limit = 10 }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all'); // all, sent, delivered, failed, clicked

  useEffect(() => {
    if (userId) {
      fetchNotifications();
      fetchStats();
    }
  }, [userId, filter]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit });
      if (filter !== 'all') {
        params.append('status', filter);
      }
      
      const response = await api.get(`/api/push-notifications/user/${userId}?${params}`);
      setNotifications(response.data.notifications || []);
    } catch (error) {
      console.error('Failed to fetch push notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get(`/api/push-notifications/user/${userId}/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await api.delete(`/api/push-notifications/${notificationId}`);
      setNotifications(prev => prev.filter(n => n._id !== notificationId));
      fetchStats();
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const clearAll = async () => {
    if (!confirm('Are you sure you want to clear all push notification history?')) return;
    
    try {
      await api.delete(`/api/push-notifications/user/${userId}`);
      setNotifications([]);
      fetchStats();
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent':
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'clicked':
        return <ExternalLink className="w-4 h-4 text-blue-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'sent':
      case 'delivered':
        return 'text-green-600 bg-green-100';
      case 'clicked':
        return 'text-blue-600 bg-blue-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-yellow-600 bg-yellow-100';
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Push Notification History
        </h3>
        {notifications.length > 0 && (
          <button
            onClick={clearAll}
            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            title="Clear all history"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded p-3">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.total || 0}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Total Sent</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded p-3">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {stats.delivered || 0}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Delivered</div>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-3">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {stats.clicked || 0}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Clicked</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded p-3">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {stats.failed || 0}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Failed</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {['all', 'sent', 'delivered', 'clicked', 'failed'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1 rounded-full text-sm capitalize transition-colors ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No push notifications found
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <div
              key={notification._id}
              className="border dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(notification.status)}
                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(notification.status)}`}>
                      {notification.status}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(notification.createdAt)}
                    </span>
                  </div>
                  
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                    {notification.title}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {notification.body}
                  </p>
                  
                  {notification.type && (
                    <div className="mt-2">
                      <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                        Type: {notification.type}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => setExpandedId(expandedId === notification._id ? null : notification._id)}
                    className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    {expandedId === notification._id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteNotification(notification._id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Expanded Details */}
              {expandedId === notification._id && (
                <div className="mt-4 pt-4 border-t dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Device Token:</span>
                      <div className="font-mono text-xs mt-1 break-all">
                        {notification.deviceToken ? `${notification.deviceToken.substring(0, 20)}...` : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Response:</span>
                      <div className="text-xs mt-1">
                        {notification.response || 'No response data'}
                      </div>
                    </div>
                    {notification.error && (
                      <div className="col-span-2">
                        <span className="text-gray-500 dark:text-gray-400">Error:</span>
                        <div className="text-xs mt-1 text-red-600 dark:text-red-400">
                          {notification.error}
                        </div>
                      </div>
                    )}
                    {notification.deliveredAt && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Delivered:</span>
                        <div className="text-xs mt-1">
                          {formatDate(notification.deliveredAt)}
                        </div>
                      </div>
                    )}
                    {notification.clickedAt && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Clicked:</span>
                        <div className="text-xs mt-1">
                          {formatDate(notification.clickedAt)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PushNotificationHistory;