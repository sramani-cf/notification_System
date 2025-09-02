'use client';

import React from 'react';
import NotificationButton from './NotificationButton';
import LoadingSpinner from './LoadingSpinner';
import { NOTIFICATION_BUTTONS } from '@/constants';

const NotificationPanel = ({ onSendNotification, loading }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Notification Triggers
      </h2>
      
      <div className="grid gap-3">
        {NOTIFICATION_BUTTONS.map((button) => (
          <NotificationButton
            key={button.type}
            button={button}
            onClick={onSendNotification}
            disabled={loading}
          />
        ))}
      </div>

      {loading && <LoadingSpinner />}
    </div>
  );
};

export default NotificationPanel;