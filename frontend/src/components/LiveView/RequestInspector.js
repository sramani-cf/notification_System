'use client';

import { useState, useEffect } from 'react';

const STAGE_ICONS = {
  'load-balancer': '⚖️',
  'server': '🖥️',
  'controller': '🎛️',
  'database': '🗄️',
  'notification': '📨',
  'queue': '📋',
  'worker': '⚙️',
  'smtp': '📮',
  'websocket': '🔌',
  'delivery': '📱'
};

const STATUS_COLORS = {
  'pending': 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/20',
  'processing': 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20',
  'completed': 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20',
  'failed': 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/20'
};

const StageTimeline = ({ stages = [], totalDuration = 0 }) => {
  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getStageProgress = (stage, index) => {
    const totalStages = stages.length;
    return ((index + 1) / totalStages) * 100;
  };

  if (stages.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 py-4">
        No stages available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stages.map((stage, index) => {
        const duration = stage.duration || (stage.endTime ? new Date(stage.endTime) - new Date(stage.startTime) : 0);
        const progress = getStageProgress(stage, index);
        
        return (
          <div key={`${stage.stage}-${index}`} className="relative">
            {/* Timeline Line */}
            {index < stages.length - 1 && (
              <div className="absolute left-4 top-8 w-0.5 h-8 bg-gray-200 dark:bg-gray-600"></div>
            )}
            
            <div className="flex items-start space-x-3">
              {/* Stage Icon */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                stage.status === 'completed' ? 'bg-green-100 dark:bg-green-900/20' :
                stage.status === 'processing' ? 'bg-blue-100 dark:bg-blue-900/20' :
                stage.status === 'failed' ? 'bg-red-100 dark:bg-red-900/20' :
                'bg-gray-100 dark:bg-gray-700'
              }`}>
                {STAGE_ICONS[stage.stage] || '⚪'}
              </div>
              
              {/* Stage Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                      {stage.component || stage.stage}
                    </h4>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[stage.status] || STATUS_COLORS.pending}`}>
                      {stage.status}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {duration > 0 ? formatDuration(duration) : '—'}
                  </span>
                </div>
                
                {/* Stage Metadata */}
                {stage.metadata && Object.keys(stage.metadata).length > 0 && (
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    {Object.entries(stage.metadata).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                        <span className="font-mono">{String(value).slice(0, 30)}</span>
                      </div>
                    )).slice(0, 3)}
                  </div>
                )}
                
                {/* Timestamps */}
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Started:</span>
                    <span>{new Date(stage.startTime).toLocaleTimeString()}</span>
                  </div>
                  {stage.endTime && (
                    <div className="flex justify-between">
                      <span>Ended:</span>
                      <span>{new Date(stage.endTime).toLocaleTimeString()}</span>
                    </div>
                  )}
                </div>
                
                {/* Error Information */}
                {stage.error && (
                  <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs">
                    <div className="text-red-700 dark:text-red-400 font-medium">Error:</div>
                    <div className="text-red-600 dark:text-red-300 mt-1">{stage.error.message}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const RequestMetadata = ({ request }) => {
  const formatValue = (value) => {
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const metadata = request.metadata || {};
  const hasMetadata = Object.keys(metadata).length > 0;

  return (
    <div className="space-y-4">
      {/* Basic Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Request ID</dt>
          <dd className="font-mono text-xs text-gray-900 dark:text-white">{request.id}</dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Type</dt>
          <dd className="font-medium text-gray-900 dark:text-white capitalize">{request.type}</dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Status</dt>
          <dd>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[request.status] || STATUS_COLORS.pending}`}>
              {request.status}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400">Total Duration</dt>
          <dd className="font-medium text-gray-900 dark:text-white">
            {request.totalDuration ? `${request.totalDuration}ms` : 'In progress...'}
          </dd>
        </div>
      </div>

      {/* Timestamps */}
      <div>
        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Timeline</h4>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Started:</span>
            <span className="font-mono text-xs">{new Date(request.startTime).toLocaleString()}</span>
          </div>
          {request.endTime && (
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Ended:</span>
              <span className="font-mono text-xs">{new Date(request.endTime).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Current Stage:</span>
            <span className="font-medium">{request.currentStage || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Metadata */}
      {hasMetadata && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Metadata</h4>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 text-xs space-y-1">
            {Object.entries(metadata).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}:
                </span>
                <span className="font-mono text-gray-900 dark:text-white max-w-32 truncate">
                  {formatValue(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {request.errors && request.errors.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
            Errors ({request.errors.length})
          </h4>
          <div className="space-y-2">
            {request.errors.map((error, index) => (
              <div key={index} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                <div className="text-sm font-medium text-red-700 dark:text-red-400">
                  {error.stage || 'Unknown Stage'}
                </div>
                <div className="text-xs text-red-600 dark:text-red-300 mt-1">
                  {error.message}
                </div>
                <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                  {new Date(error.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function RequestInspector({ request, isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('timeline');

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !request) return null;

  const tabs = [
    { id: 'timeline', label: 'Timeline', icon: '📋' },
    { id: 'metadata', label: 'Details', icon: '📊' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="text-2xl">🔍</div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Request Inspector
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {request.type} • {request.id.slice(0, 8)}...
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400\" fill="none\" stroke="currentColor\" viewBox="0 0 24 24">
              <path strokeLinecap="round\" strokeLinejoin="round\" strokeWidth={2} d="M6 18L18 6M6 6l12 12\" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
          {activeTab === 'timeline' && (
            <StageTimeline 
              stages={request.stages || []} 
              totalDuration={request.totalDuration}
            />
          )}
          
          {activeTab === 'metadata' && (
            <RequestMetadata request={request} />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
            <div className="flex space-x-2">
              <button className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                📋 Copy ID
              </button>
              <button className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                📊 Export Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}