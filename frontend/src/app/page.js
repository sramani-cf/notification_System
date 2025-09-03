'use client';

import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import NotificationPanel from '@/components/NotificationPanel';
import NotificationHistory from '@/components/NotificationHistory';
import ResponseDisplay from '@/components/ResponseDisplay';
import { useNotifications } from '@/hooks/useNotifications';

export default function NotificationDemo() {
  const {
    loading,
    bulkLoading,
    bulkProgress,
    response,
    error,
    sentNotifications,
    clickCounters,
    totalClicks,
    bulkCount,
    sendNotification,
    sendBulkNotification,
    stopBulk,
    clearHistory,
    clearCounters,
    setBulkCount,
    hasNotifications
  } = useNotifications();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <Header />

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Action Panels */}
          <div className="lg:col-span-2 space-y-6">
            <NotificationPanel 
              onSendNotification={sendNotification}
              onSendBulkNotification={sendBulkNotification}
              loading={loading}
              bulkLoading={bulkLoading}
              bulkProgress={bulkProgress}
              clickCounters={clickCounters}
              totalClicks={totalClicks}
              bulkCount={bulkCount}
              onClearCounters={clearCounters}
              onSetBulkCount={setBulkCount}
              onStopBulk={stopBulk}
            />
            
            <ResponseDisplay 
              response={response} 
              error={error} 
            />
          </div>

          {/* Right Column - History */}
          <div className="lg:col-span-1">
            <NotificationHistory 
              notifications={sentNotifications} 
              onClear={clearHistory}
            />
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}