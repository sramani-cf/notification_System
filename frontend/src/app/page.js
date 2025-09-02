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
    response,
    error,
    sentNotifications,
    sendNotification,
    clearHistory,
    hasNotifications
  } = useNotifications();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <Header />

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <NotificationPanel 
              onSendNotification={sendNotification} 
              loading={loading} 
            />
            
            <ResponseDisplay 
              response={response} 
              error={error} 
            />
          </div>

          <NotificationHistory 
            notifications={sentNotifications} 
            onClear={clearHistory}
          />
        </div>

        <Footer />
      </div>
    </div>
  );
}