'use client';

import React from 'react';

const LoadingSpinner = () => {
  return (
    <div className="mt-4 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" role="status">
        <span className="sr-only">Loading...</span>
      </div>
    </div>
  );
};

export default LoadingSpinner;