'use client';

import { useState, useEffect } from 'react';

const STATUS_COLORS = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500', 
  critical: 'bg-red-500'
};

const STATUS_TEXT_COLORS = {
  healthy: 'text-green-700 dark:text-green-300',
  degraded: 'text-yellow-700 dark:text-yellow-300',
  critical: 'text-red-700 dark:text-red-300'
};

export default function SystemStatusHeader({ 
  systemStatus = {}, 
  activeRequests = 0, 
  isConnected = false 
}) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatUptime = (uptimeMs) => {
    if (!uptimeMs) return 'N/A';
    
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num?.toString() || '0';
  };

  const status = systemStatus?.status || 'unknown';
  const requestsPerSecond = systemStatus?.requestsPerSecond || 0;
  const averageLatency = systemStatus?.averageLatency || 0;
  const errorRate = systemStatus?.errorRate || 0;
  const totalRequests = systemStatus?.totalRequests || 0;

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* System Status */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[status] || 'bg-gray-500'}`}></div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
                  System Status
                </p>
                <p className={`text-sm font-semibold ${STATUS_TEXT_COLORS[status] || 'text-gray-600 dark:text-gray-300'}`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </p>
              </div>
            </div>
          </div>

          {/* Active Requests */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
              Active Requests
            </p>
            <div className="flex items-baseline space-x-1">
              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {formatNumber(activeRequests)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                live
              </p>
            </div>
          </div>

          {/* Requests Per Second */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
              Requests/sec
            </p>
            <div className="flex items-baseline space-x-1">
              <p className="text-lg font-bold text-green-600 dark:text-green-400">
                {requestsPerSecond.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                rps
              </p>
            </div>
          </div>

          {/* Average Latency */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
              Avg Latency
            </p>
            <div className="flex items-baseline space-x-1">
              <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                {averageLatency}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ms
              </p>
            </div>
          </div>

          {/* Error Rate */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
              Error Rate
            </p>
            <div className="flex items-baseline space-x-1">
              <p className={`text-lg font-bold ${
                errorRate > 5 
                  ? 'text-red-600 dark:text-red-400' 
                  : 'text-green-600 dark:text-green-400'
              }`}>
                {errorRate.toFixed(1)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                %
              </p>
            </div>
          </div>

          {/* Uptime */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">
              Uptime
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {formatUptime(systemStatus?.uptime)}
            </p>
          </div>
        </div>

        {/* Additional Stats Row */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-6">
            <span>Total Requests: <strong className="text-gray-700 dark:text-gray-300">{formatNumber(totalRequests)}</strong></span>
            <span>Completed: <strong className="text-green-600 dark:text-green-400">{formatNumber(systemStatus?.completedRequests || 0)}</strong></span>
            <span>Failed: <strong className="text-red-600 dark:text-red-400">{formatNumber(systemStatus?.failedRequests || 0)}</strong></span>
          </div>
          <div className="flex items-center space-x-2">
            <span>Last Updated: {isClient ? currentTime.toLocaleTimeString() : '--:--:--'}</span>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          </div>
        </div>
      </div>
    </div>
  );
}