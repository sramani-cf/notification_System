'use client';

import React from 'react';
import { getNotificationTypeColor, formatNotificationType } from '@/utils/formatters';

const NotificationHistory = ({ notifications, onClear }) => {
  const hasNotifications = notifications.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Notification History
        </h2>
        {hasNotifications && (
          <button
            onClick={onClear}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Clear notification history"
          >
            Clear History
          </button>
        )}
      </div>

      {!hasNotifications ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <p>No notifications sent yet</p>
          <p className="text-sm mt-2">Click a button to send your first notification</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {notifications.map((notif) => (
            <NotificationHistoryItem key={notif.id} notification={notif} />
          ))}
        </div>
      )}
    </div>
  );
};

const NotificationHistoryItem = ({ notification }) => {
  return (
    <div
      className={`p-3 rounded-lg border ${
        notification.status === 'error'
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${getNotificationTypeColor(notification.type)}`}>
            {formatNotificationType(notification.type)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {notification.sentAt}
          </span>
        </div>
        <span className={`text-xs font-medium ${
          notification.status === 'error' 
            ? 'text-red-600 dark:text-red-400' 
            : 'text-green-600 dark:text-green-400'
        }`}>
          {notification.status === 'error' ? '❌ Failed' : '✅ Sent'}
        </span>
      </div>
      <details className="cursor-pointer">
        <summary className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100">
          View payload
        </summary>
        <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto bg-white dark:bg-gray-800 p-2 rounded">
          {JSON.stringify(notification, null, 2)}
        </pre>
      </details>
    </div>
  );
};

export default NotificationHistory;