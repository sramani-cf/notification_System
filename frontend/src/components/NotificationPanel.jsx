'use client';

import React from 'react';
import NotificationButton from './NotificationButton';
import BulkActionButtons from './BulkActionButtons';
import ActionCounter from './ActionCounter';
import LoadingSpinner from './LoadingSpinner';
import { NOTIFICATION_BUTTONS } from '@/constants';

const NotificationPanel = ({ 
  onSendNotification, 
  onSendBulkNotification,
  loading, 
  bulkLoading,
  bulkProgress,
  clickCounters,
  totalClicks,
  bulkCount,
  onClearCounters,
  onSetBulkCount,
  onStopBulk
}) => {
  return (
    <div className="space-y-4">
      {/* Statistics and Controls */}
      <ActionCounter 
        clickCounters={clickCounters}
        totalClicks={totalClicks}
        onClearCounters={onClearCounters}
        bulkCount={bulkCount}
        onSetBulkCount={onSetBulkCount}
        bulkLoading={bulkLoading}
        bulkProgress={bulkProgress}
        onStopBulk={onStopBulk}
      />

      {/* Main Action Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        {/* Single Action Buttons */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Single Actions
          </h2>
          
          <div className="flex flex-wrap gap-3">
            {NOTIFICATION_BUTTONS.map((button) => (
              <div key={button.type} className="relative">
                <button
                  onClick={() => onSendNotification(button.type)}
                  disabled={loading || bulkLoading}
                  className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r ${button.gradient} disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] text-sm font-medium min-w-fit`}
                  aria-label={`Send ${button.label} notification`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={button.icon} />
                  </svg>
                  <div className="text-left">
                    <div className="font-medium">{button.label}</div>
                    <div className="text-xs opacity-75">{button.subtitle}</div>
                  </div>
                </button>
                
                {/* Click Counter Badge */}
                {clickCounters[button.type] > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center">
                    {clickCounters[button.type]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bulk Action Buttons */}
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <BulkActionButtons 
            onSendBulkNotification={onSendBulkNotification}
            disabled={loading || bulkLoading}
            bulkCount={bulkCount}
          />
        </div>

        {/* Loading Indicators */}
        {loading && (
          <div className="mt-4">
            <LoadingSpinner />
            <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">
              Sending notification...
            </p>
          </div>
        )}
        
        {bulkLoading && (
          <div className="mt-4">
            <LoadingSpinner />
            <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">
              Processing bulk operation...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationPanel;