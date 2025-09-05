'use client';

import { useState } from 'react';

export default function ControlPanel({ settings = {}, onChange, onSimulate }) {
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationConfig, setSimulationConfig] = useState({
    type: 'signup',
    count: 5,
    interval: 2000
  });

  const handleSpeedChange = (speed) => {
    onChange('playbackSpeed', speed);
  };

  const handleDelayChange = (component, delay) => {
    onChange('delays', {
      ...settings.delays,
      [component]: parseInt(delay) || 0
    });
  };

  const handleFilterChange = (filter, value) => {
    onChange('filters', {
      ...settings.filters,
      [filter]: value
    });
  };

  const handleSimulate = async () => {
    if (isSimulating) return;
    
    setIsSimulating(true);
    try {
      await onSimulate(simulationConfig.type, simulationConfig.count, simulationConfig.interval);
      setTimeout(() => setIsSimulating(false), 1000);
    } catch (error) {
      console.error('Simulation failed:', error);
      setIsSimulating(false);
    }
  };

  const speedOptions = [
    { value: 0.25, label: '0.25x' },
    { value: 0.5, label: '0.5x' },
    { value: 1, label: '1x' },
    { value: 2, label: '2x' },
    { value: 5, label: '5x' }
  ];

  const notificationTypes = [
    { value: 'signup', label: 'Signup', emoji: '👤' },
    { value: 'login', label: 'Login', emoji: '🔐' },
    { value: 'reset_password', label: 'Reset Password', emoji: '🔑' },
    { value: 'purchase', label: 'Purchase', emoji: '💰' },
    { value: 'friend_request', label: 'Friend Request', emoji: '👥' }
  ];

  return (
    <div className="space-y-6">
      {/* Playback Speed */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Playback Speed
        </label>
        <div className="flex space-x-2">
          {speedOptions.map(option => (
            <button
              key={option.value}
              onClick={() => handleSpeedChange(option.value)}
              className={`px-3 py-1 text-xs rounded border transition-colors ${
                settings.playbackSpeed === option.value
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step Mode */}
      <div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={settings.stepMode || false}
            onChange={(e) => onChange('stepMode', e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500\"
          />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Step-by-Step Mode
          </span>
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Manually control request progression
        </p>
      </div>

      {/* Delay Controls */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Component Delays (ms)
        </label>
        <div className="space-y-2">
          {[
            { key: 'loadBalancer', label: 'Load Balancer' },
            { key: 'serverProcessing', label: 'Server Processing' },
            { key: 'databaseOperation', label: 'Database' },
            { key: 'queueing', label: 'Queueing' },
            { key: 'workerProcessing', label: 'Worker Processing' },
            { key: 'emailDelivery', label: 'Email Delivery' },
            { key: 'websocketDelivery', label: 'WebSocket Delivery' }
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400 w-20 truncate">
                {label}
              </span>
              <input
                type="number\"
                min="0\"
                max="10000\"
                step="100\"
                value={settings.delays?.[key] || 0}
                onChange={(e) => handleDelayChange(key, e.target.value)}
                className="w-16 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white\"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Flow Filters
        </label>
        <div className="space-y-2">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.filters?.showEmailFlow !== false}
              onChange={(e) => handleFilterChange('showEmailFlow', e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500\"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">Show Email Flow</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.filters?.showInAppFlow !== false}
              onChange={(e) => handleFilterChange('showInAppFlow', e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500\"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">Show In-App Flow</span>
          </label>
        </div>
      </div>

      {/* Load Simulation */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Load Simulation
        </label>
        <div className="space-y-3">
          {/* Simulation Type */}
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              Notification Type
            </label>
            <select
              value={simulationConfig.type}
              onChange={(e) => setSimulationConfig(prev => ({ ...prev, type: e.target.value }))}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white\"
            >
              {notificationTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.emoji} {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Count and Interval */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Count
              </label>
              <input
                type="number\"
                min="1\"
                max="50\"
                value={simulationConfig.count}
                onChange={(e) => setSimulationConfig(prev => ({ 
                  ...prev, 
                  count: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)) 
                }))}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white\"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                Interval (ms)
              </label>
              <input
                type="number\"
                min="500\"
                max="10000\"
                step="500\"
                value={simulationConfig.interval}
                onChange={(e) => setSimulationConfig(prev => ({ 
                  ...prev, 
                  interval: Math.max(500, Math.min(10000, parseInt(e.target.value) || 1000))
                }))}
                className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white\"
              />
            </div>
          </div>

          {/* Simulate Button */}
          <button
            onClick={handleSimulate}
            disabled={isSimulating}
            className={`w-full py-2 px-3 text-sm font-medium rounded-md transition-colors ${
              isSimulating
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isSimulating ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Simulating...</span>
              </div>
            ) : (
              `🚀 Start Simulation`
            )}
          </button>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            This will generate {simulationConfig.count} {simulationConfig.type} requests 
            with {simulationConfig.interval}ms intervals
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Quick Actions
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button className="px-3 py-2 text-xs bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors">
            📊 Export Data
          </button>
          <button className="px-3 py-2 text-xs bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors">
            🔄 Reset View
          </button>
        </div>
      </div>
    </div>
  );
}