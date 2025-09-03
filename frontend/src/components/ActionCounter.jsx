'use client';

import React from 'react';

const ActionCounter = ({ clickCounters, totalClicks, onClearCounters, bulkCount, onSetBulkCount, bulkLoading, bulkProgress, onStopBulk }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Click Statistics */}
        <div className="flex flex-wrap gap-4">
          <div className="text-sm">
            <span className="font-medium text-gray-900 dark:text-white">Total: </span>
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{totalClicks}</span>
          </div>
          <div className="text-sm space-x-3">
            <span className="text-green-600 dark:text-green-400">Signup: {clickCounters.signup}</span>
            <span className="text-blue-600 dark:text-blue-400">Login: {clickCounters.login}</span>
            <span className="text-yellow-600 dark:text-yellow-400">Reset: {clickCounters.reset_password}</span>
            <span className="text-purple-600 dark:text-purple-400">Purchase: {clickCounters.purchase}</span>
            <span className="text-indigo-600 dark:text-indigo-400">Friend: {clickCounters.friendRequest}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Bulk Count Input */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulk:</label>
            <input
              type="number"
              min="1"
              max="100"
              value={bulkCount}
              onChange={(e) => onSetBulkCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              disabled={bulkLoading}
            />
          </div>

          {/* Stop Button (only show during bulk operation) */}
          {bulkLoading && (
            <button
              onClick={onStopBulk}
              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded transition-colors"
            >
              Stop
            </button>
          )}

          {/* Clear Counters Button */}
          <button
            onClick={onClearCounters}
            className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-sm rounded transition-colors"
            disabled={bulkLoading}
          >
            Clear Stats
          </button>
        </div>
      </div>

      {/* Bulk Progress Bar */}
      {bulkLoading && bulkProgress.total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
            <span>Processing {bulkProgress.type} ({bulkProgress.current}/{bulkProgress.total})</span>
            <span>{Math.round((bulkProgress.current / bulkProgress.total) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ActionCounter;