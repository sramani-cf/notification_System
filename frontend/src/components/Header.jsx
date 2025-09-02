'use client';

import React from 'react';
import { API_BASE_URL } from '@/constants';

const Header = () => {
  return (
    <header className="text-center mb-10">
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
        Notification System Demo
      </h1>
      <p className="text-gray-600 dark:text-gray-300">
        Click any button to send mock notification data to your backend
      </p>
      <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
        <span className="text-sm text-blue-600 dark:text-blue-400">Backend URL:</span>
        <code className="text-sm font-mono bg-white dark:bg-gray-800 px-2 py-1 rounded">
          {API_BASE_URL}
        </code>
      </div>
    </header>
  );
};

export default Header;