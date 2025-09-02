'use client';

import React from 'react';

const NotificationButton = ({ button, onClick, disabled }) => {
  return (
    <button
      onClick={() => onClick(button.type)}
      disabled={disabled}
      className={`flex items-center justify-between p-4 bg-gradient-to-r ${button.gradient} disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]`}
      aria-label={`Send ${button.label} notification`}
    >
      <div className="flex items-center gap-3">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={button.icon} />
        </svg>
        <span className="font-medium">{button.label}</span>
      </div>
      <span className="text-sm opacity-75">{button.subtitle}</span>
    </button>
  );
};

export default NotificationButton;