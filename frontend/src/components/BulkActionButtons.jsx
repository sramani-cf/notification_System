'use client';

import React from 'react';
import { NOTIFICATION_BUTTONS } from '@/constants';

const BulkActionButtons = ({ onSendBulkNotification, disabled, bulkCount }) => {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        Bulk Actions ({bulkCount}x each)
      </h3>
      
      <div className="flex flex-wrap gap-2">
        {NOTIFICATION_BUTTONS.map((button) => (
          <button
            key={`bulk-${button.type}`}
            onClick={() => onSendBulkNotification(button.type)}
            disabled={disabled}
            className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${button.gradient} disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] text-sm font-medium min-w-fit`}
            aria-label={`Send ${bulkCount} ${button.label} notifications`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={button.icon} />
            </svg>
            <span>{bulkCount}x {button.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BulkActionButtons;