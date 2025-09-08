'use client';

import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle, XCircle, Clock, RefreshCw, Send, AlertCircle, MousePointer } from 'lucide-react';

const PushNotificationStatus = ({ purchaseId }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (purchaseId) {
      fetchNotificationStatus();
    }
  }, [purchaseId]);

  const fetchNotificationStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`http://localhost:8000/api/push-notifications/purchase/${purchaseId}/status`);
      
      if (!response.ok) {
        if (response.status === 404) {
          setStatus(null);
          return;
        }
        throw new Error('Failed to fetch notification status');
      }
      
      const data = await response.json();
      // Use comprehensive tracking data from purchase model
      if (data.data.tracking) {
        setStatus({
          ...data.data.tracking,
          notification: data.data.notification,
          deliveryHistory: data.data.deliveryHistory
        });
      } else {
        setStatus(data.data);
      }
    } catch (err) {
      setError(err.message);
      console.error('Error fetching push notification status:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusDisplay = () => {
    if (!status) {
      return {
        icon: <AlertCircle className="w-5 h-5" />,
        text: 'No push notification',
        color: 'text-gray-500',
        bgColor: 'bg-gray-100',
        description: 'Push notification was not created for this purchase'
      };
    }

    switch (status.status) {
      case 'pending':
        return {
          icon: <Clock className="w-5 h-5" />,
          text: 'Pending',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          description: 'Push notification is queued for sending'
        };
      
      case 'processing':
        return {
          icon: <RefreshCw className="w-5 h-5 animate-spin" />,
          text: 'Processing',
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          description: 'Push notification is being sent'
        };
      
      case 'sent':
        return {
          icon: <Send className="w-5 h-5" />,
          text: 'Sent',
          color: 'text-indigo-600',
          bgColor: 'bg-indigo-100',
          description: 'Push notification has been sent to FCM'
        };
      
      case 'delivered':
        return {
          icon: <CheckCircle className="w-5 h-5" />,
          text: 'Delivered',
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          description: 'Push notification was successfully delivered'
        };
      
      case 'clicked':
        return {
          icon: <MousePointer className="w-5 h-5" />,
          text: 'Clicked',
          color: 'text-purple-600',
          bgColor: 'bg-purple-100',
          description: 'User clicked on the push notification'
        };
      
      case 'failed':
        return {
          icon: <XCircle className="w-5 h-5" />,
          text: 'Failed',
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          description: status.failureReason || 'Push notification delivery failed'
        };
      
      default:
        return {
          icon: <Bell className="w-5 h-5" />,
          text: status.status,
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          description: 'Unknown status'
        };
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
          <span className="text-gray-500">Loading push notification status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
        <div className="flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500" />
          <div>
            <span className="text-red-600 font-medium">Error loading status</span>
            <p className="text-sm text-gray-500 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const displayInfo = getStatusDisplay();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Bell className="w-4 h-4" />
          Push Notification Status
        </h4>
        <button
          onClick={fetchNotificationStatus}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="Refresh status"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className={`flex items-start gap-3 p-3 rounded-lg ${displayInfo.bgColor}`}>
        <div className={displayInfo.color}>
          {displayInfo.icon}
        </div>
        <div className="flex-1">
          <div className={`font-medium ${displayInfo.color}`}>
            {displayInfo.text}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {displayInfo.description}
          </p>
        </div>
      </div>

      {status && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Type:</span>
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {status.type || 'N/A'}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-gray-500">Priority:</span>
            <span className={`font-medium ${
              status.priority === 'urgent' ? 'text-red-600' :
              status.priority === 'high' ? 'text-orange-600' :
              status.priority === 'normal' ? 'text-blue-600' :
              'text-gray-600'
            }`}>
              {status.priority || 'N/A'}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Attempts:</span>
            <span className="text-gray-700 dark:text-gray-300">
              {status.attempts || 0}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">Queue:</span>
            <span className="text-gray-700 dark:text-gray-300 font-mono text-xs">
              {status.queueName || 'N/A'}
            </span>
          </div>

          {status.timestamps && (
            <>
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-gray-500 mb-1">Timeline:</div>
                <div className="space-y-1 text-xs">
                  {status.createdAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Created:</span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatTimestamp(status.createdAt)}
                      </span>
                    </div>
                  )}
                  {status.timestamps.sentAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Sent:</span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatTimestamp(status.timestamps.sentAt)}
                      </span>
                    </div>
                  )}
                  {status.timestamps.deliveredAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Delivered:</span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatTimestamp(status.timestamps.deliveredAt)}
                      </span>
                    </div>
                  )}
                  {status.timestamps.clickedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Clicked:</span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatTimestamp(status.timestamps.clickedAt)}
                      </span>
                    </div>
                  )}
                  {status.timestamps.failedAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Failed:</span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {formatTimestamp(status.timestamps.failedAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {status.fcmResponse && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-gray-500 mb-1">FCM Response:</div>
              <div className="flex gap-4 text-xs">
                <span className="text-green-600">
                  Success: {status.fcmResponse.successCount || status.fcmResponse.success || 0}
                </span>
                <span className="text-red-600">
                  Failed: {status.fcmResponse.failureCount || status.fcmResponse.failure || 0}
                </span>
              </div>
              {status.fcmTokenCount > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  Total Tokens: {status.fcmTokenCount}
                </div>
              )}
            </div>
          )}

          {status.deliveryHistory && status.deliveryHistory.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-gray-500 mb-1">Delivery History:</div>
              <div className="space-y-1 text-xs max-h-32 overflow-y-auto">
                {status.deliveryHistory.map((entry, index) => (
                  <div key={index} className="flex justify-between p-1 bg-gray-50 dark:bg-gray-900 rounded">
                    <span className="text-gray-600 dark:text-gray-400">
                      Attempt {entry.attempt}: {entry.status}
                    </span>
                    <span className="text-gray-500">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Total History Entries: {status.totalHistoryEntries || status.deliveryHistory.length}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PushNotificationStatus;