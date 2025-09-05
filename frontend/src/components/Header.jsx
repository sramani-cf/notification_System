'use client';

import React from 'react';
import Link from 'next/link';
import { API_BASE_URL } from '@/constants';

const Header = () => {
  return (
    <header className="text-center mb-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          Notification System Demo
        </h1>
        <Link 
          href="/live-view"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        >
          <span className="text-lg">🚀</span>
          <span>Live View Dashboard</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">NEW</span>
        </Link>
      </div>
      <p className="text-gray-600 dark:text-gray-300 mb-4">
        Click any button to send mock notification data to your backend
      </p>
      <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
        <span className="text-sm text-blue-600 dark:text-blue-400">Backend URL:</span>
        <code className="text-sm font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded">
          {API_BASE_URL}
        </code>
      </div>
    </header>
  );
};

export default Header;