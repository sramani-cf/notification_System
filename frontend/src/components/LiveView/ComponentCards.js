'use client';

import { useState } from 'react';

const COMPONENT_ICONS = {
  'LoadBalancer': '⚖️',
  'SERVER-1': '🖥️',
  'SERVER-2': '🖥️', 
  'SERVER-3': '🖥️',
  'Database': '🗄️',
  'NotificationService': '📨',
  'QueueManager': '📋',
  'WebSocketService': '🔌',
  'MailWorker': '📧',
  'InAppWorker': '💬',
  'EmailService': '📮',
  'ClientDelivery': '📱',
  'QUEUE-MAIL': '📧',
  'QUEUE-RETRY1': '🔄',
  'QUEUE-RETRY2': '🔄',
  'QUEUE-DLQ': '💀',
  'QUEUE-INAPP': '💬',
  'QUEUE-INAPPRETRY': '🔄'
};

const StatusIndicator = ({ status }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'degraded': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'degraded': return 'Degraded';
      case 'critical': return 'Critical';
      default: return 'Unknown';
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`w-2 h-2 rounded-full ${getStatusColor(status)}`}></div>
      <span className={`text-xs font-medium ${
        status === 'healthy' ? 'text-green-700 dark:text-green-300' :
        status === 'degraded' ? 'text-yellow-700 dark:text-yellow-300' :
        status === 'critical' ? 'text-red-700 dark:text-red-300' :
        'text-gray-700 dark:text-gray-300'
      }`}>
        {getStatusText(status)}
      </span>
    </div>
  );
};

const ComponentCard = ({ name, data, isExpanded, onToggle }) => {
  const formatUptime = (uptimeMs) => {
    if (!uptimeMs) return 'N/A';
    
    const totalSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return `${totalSeconds}s`;
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
    } else if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    } else if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${bytes}B`;
  };

  const renderMetrics = () => {
    if (!data || !isExpanded) return null;

    const metrics = [];

    // Load Balancer specific metrics
    if (name === 'LoadBalancer' && data) {
      metrics.push(
        <div key="servers\" className="flex justify-between\">
          <span className="text-gray-600 dark:text-gray-400\">Servers:</span>
          <span className="font-medium\">{data.healthyServers}/{data.totalServers}</span>
        </div>
      );
      if (data.stickySessions?.totalSessions) {
        metrics.push(
          <div key="sessions\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Sessions:</span>
            <span className="font-medium\">{data.stickySessions.totalSessions}</span>
          </div>
        );
      }
    }

    // Server specific metrics
    if (name.startsWith('SERVER-') && data) {
      if (data.memoryUsage?.heapUsed) {
        metrics.push(
          <div key="memory\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Memory:</span>
            <span className="font-medium\">{formatBytes(data.memoryUsage.heapUsed)}</span>
          </div>
        );
      }
      if (data.pid) {
        metrics.push(
          <div key="pid\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">PID:</span>
            <span className="font-medium\">{data.pid}</span>
          </div>
        );
      }
      if (data.activeConnections !== undefined) {
        metrics.push(
          <div key="connections\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Connections:</span>
            <span className="font-medium\">{data.activeConnections}</span>
          </div>
        );
      }
    }

    // WebSocket specific metrics
    if (name === 'WebSocketService' && data) {
      if (data.totalConnections !== undefined) {
        metrics.push(
          <div key="wsconnections\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">WS Connections:</span>
            <span className="font-medium\">{data.totalConnections}</span>
          </div>
        );
      }
      if (data.authenticatedUsers !== undefined) {
        metrics.push(
          <div key="authusers\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Auth Users:</span>
            <span className="font-medium\">{data.authenticatedUsers}</span>
          </div>
        );
      }
    }

    // Queue specific metrics
    if (name.startsWith('QUEUE-') && data) {
      const queueData = data;
      
      if (queueData.waiting !== undefined) {
        metrics.push(
          <div key="waiting\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Waiting:</span>
            <span className="font-medium text-yellow-600 dark:text-yellow-400\">{queueData.waiting}</span>
          </div>
        );
      }
      
      if (queueData.active !== undefined) {
        metrics.push(
          <div key="active\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Active:</span>
            <span className="font-medium text-blue-600 dark:text-blue-400\">{queueData.active}</span>
          </div>
        );
      }
      
      if (queueData.completed !== undefined) {
        metrics.push(
          <div key="completed\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Completed:</span>
            <span className="font-medium text-green-600 dark:text-green-400\">{queueData.completed}</span>
          </div>
        );
      }
      
      if (queueData.failed !== undefined) {
        metrics.push(
          <div key="failed\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Failed:</span>
            <span className="font-medium text-red-600 dark:text-red-400\">{queueData.failed}</span>
          </div>
        );
      }
      
      if (queueData.delayed !== undefined) {
        metrics.push(
          <div key="delayed\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Delayed:</span>
            <span className="font-medium text-purple-600 dark:text-purple-400\">{queueData.delayed}</span>
          </div>
        );
      }
      
      if (queueData.total !== undefined) {
        metrics.push(
          <div key="total\" className="flex justify-between font-semibold\">
            <span className="text-gray-700 dark:text-gray-300\">Total:</span>
            <span className="text-gray-900 dark:text-white\">{queueData.total}</span>
          </div>
        );
      }

      // Telemetry-specific queue metrics
      if (queueData.jobsAdded) {
        metrics.push(
          <div key="jobs-added\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Jobs Added:</span>
            <span className="font-medium text-indigo-600 dark:text-indigo-400\">{queueData.jobsAdded}</span>
          </div>
        );
      }
      
      if (queueData.jobsCompleted) {
        metrics.push(
          <div key="jobs-completed\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Jobs Done:</span>
            <span className="font-medium text-green-600 dark:text-green-400\">{queueData.jobsCompleted}</span>
          </div>
        );
      }
      
      if (queueData.jobsFailed) {
        metrics.push(
          <div key="jobs-failed\" className="flex justify-between\">
            <span className="text-gray-600 dark:text-gray-400\">Jobs Failed:</span>
            <span className="font-medium text-red-600 dark:text-red-400\">{queueData.jobsFailed}</span>
          </div>
        );
      }
    }

    // Generic uptime for all components
    if (data.uptime) {
      metrics.push(
        <div key="uptime\" className="flex justify-between\">
          <span className="text-gray-600 dark:text-gray-400\">Uptime:</span>
          <span className="font-medium\">{formatUptime(data.uptime)}</span>
        </div>
      );
    }

    // Last update time
    if (data.timestamp) {
      const lastUpdate = new Date(data.timestamp);
      const now = new Date();
      const diffMs = now - lastUpdate;
      const diffSeconds = Math.floor(diffMs / 1000);
      
      metrics.push(
        <div key="updated" className="flex justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-500">Updated:</span>
          <span className="text-gray-500 dark:text-gray-500">
            {diffSeconds < 60 ? `${diffSeconds}s ago` : `${Math.floor(diffSeconds / 60)}m ago`}
          </span>
        </div>
      );
    }

    return (
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 space-y-2 text-xs">
        {metrics}
      </div>
    );
  };

  const status = data?.status || 'unknown';

  return (
    <div 
      className={`bg-gray-50 dark:bg-gray-700 rounded-lg p-3 cursor-pointer transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-600 ${
        isExpanded ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between\">
        <div className="flex items-center space-x-2\">
          <span className="text-lg\">{COMPONENT_ICONS[name] || '⚙️'}</span>
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white\">
              {name === 'NotificationService' ? 'Notification Service' :
               name === 'WebSocketService' ? 'WebSocket Service' :
               name === 'QueueManager' ? 'Queue Manager' :
               name === 'EmailService' ? 'Email Service' :
               name === 'ClientDelivery' ? 'Client Delivery' :
               name}
            </h4>
            <StatusIndicator status={status} />
          </div>
        </div>
        <div className="flex items-center space-x-2\">
          {data && (
            <div className="text-xs text-gray-500 dark:text-gray-400\">
              {isExpanded ? '−' : '+'}
            </div>
          )}
        </div>
      </div>
      
      {renderMetrics()}
    </div>
  );
};

export default function ComponentCards({ 
  components = {}, 
  connectionStats = {} 
}) {
  const [expandedComponents, setExpandedComponents] = useState(new Set(['LoadBalancer']));

  const toggleComponent = (componentName) => {
    setExpandedComponents(prev => {
      const next = new Set(prev);
      if (next.has(componentName)) {
        next.delete(componentName);
      } else {
        next.add(componentName);
      }
      return next;
    });
  };

  // Sort components by priority
  const componentOrder = [
    'LoadBalancer',
    'SERVER-1', 'SERVER-2', 'SERVER-3',
    'NotificationService',
    'QueueManager', 'WebSocketService',
    'MailWorker', 'InAppWorker',
    'EmailService', 'ClientDelivery'
  ];

  const sortedComponents = componentOrder
    .filter(name => components[name] || name.startsWith('SERVER-'))
    .concat(
      Object.keys(components).filter(name => !componentOrder.includes(name))
    );

  if (sortedComponents.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 py-8\">
        <div className="text-4xl mb-2\">📡</div>
        <p className="text-sm\">No components data available</p>
        <p className="text-xs mt-1\">Make sure the backend is running</p>
      </div>
    );
  }

  return (
    <div className="space-y-3\">
      <div className="flex items-center justify-between mb-4\">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white\">
          System Components ({sortedComponents.length})
        </h3>
        <div className="flex space-x-2\">
          <button 
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline\"
            onClick={() => setExpandedComponents(new Set(sortedComponents))}
          >
            Expand All
          </button>
          <button 
            className="text-xs text-gray-600 dark:text-gray-400 hover:underline\"
            onClick={() => setExpandedComponents(new Set())}
          >
            Collapse All
          </button>
        </div>
      </div>

      {sortedComponents.map(componentName => (
        <ComponentCard
          key={componentName}
          name={componentName}
          data={components[componentName]}
          isExpanded={expandedComponents.has(componentName)}
          onToggle={() => toggleComponent(componentName)}
        />
      ))}

      {/* Connection Stats Summary */}
      {connectionStats && Object.keys(connectionStats).length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600\">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3\">
            Connection Summary
          </h4>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3\">
            <div className="grid grid-cols-2 gap-2 text-xs\">
              <div className="flex justify-between\">
                <span className="text-blue-700 dark:text-blue-300\">Total:</span>
                <span className="font-medium\">{connectionStats.totalConnections || 0}</span>
              </div>
              <div className="flex justify-between\">
                <span className="text-blue-700 dark:text-blue-300\">Authenticated:</span>
                <span className="font-medium\">{connectionStats.authenticatedUsers || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}