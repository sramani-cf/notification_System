'use client';

import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import NotificationPanel from '@/components/NotificationPanel';
import NotificationHistory from '@/components/NotificationHistory';
import ResponseDisplay from '@/components/ResponseDisplay';
import NotificationManager from '@/components/NotificationManager';
import UserInfo from '@/components/UserInfo';
import { useNotifications } from '@/hooks/useNotifications';
import { useUser } from '@/contexts/UserContext';

export default function NotificationDemo() {
  const { user, isLoading: userLoading } = useUser();
  
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
  } = useNotifications(user);

  // Show loading state while user is being initialized
  if (userLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Initializing user session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <Header />

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Action Panels */}
          <div className="lg:col-span-2 space-y-6">
            <UserInfo />
            
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
      
      {/* WebSocket Notification Manager */}
      <NotificationManager user={user} />
    </div>
  );
}