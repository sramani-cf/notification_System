'use client';

import React from 'react';
import { useUser } from '@/contexts/UserContext';
import { RefreshCw, User, Key, Mail } from 'lucide-react';

const UserInfo = () => {
  const { user, refreshSession, isLoading } = useUser();

  if (!user) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <User className="w-4 h-4" />
          Current Session
        </h3>
        <button
          onClick={refreshSession}
          disabled={isLoading}
          className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
          title="Get new user ID"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      <div className="space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Key className="w-3 h-3 text-gray-500" />
          <span className="text-gray-600 dark:text-gray-400">User ID:</span>
          <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
            {user.userId}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <User className="w-3 h-3 text-gray-500" />
          <span className="text-gray-600 dark:text-gray-400">Username:</span>
          <span className="font-mono text-gray-800 dark:text-gray-200">
            {user.username}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <Mail className="w-3 h-3 text-gray-500" />
          <span className="text-gray-600 dark:text-gray-400">Email:</span>
          <span className="font-mono text-gray-800 dark:text-gray-200 text-xs">
            {user.email}
          </span>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs text-gray-500 dark:text-gray-500">
          This user ID is used for both API requests and WebSocket connections
        </p>
      </div>
    </div>
  );
};

export default UserInfo;