'use client';

import React from 'react';
import PushNotificationStatus from './PushNotificationStatus';

const ResponseDisplay = ({ response, error }) => {
  if (!response && !error) return null;

  // Extract purchase ID if this is a purchase notification response
  const getPurchaseId = () => {
    if (!response || error) return null;
    
    // Check if this is a purchase creation response
    if (response.data && response.data._id && response.data.orderId) {
      return response.data._id;
    }
    
    // Check if notification response contains purchase ID
    if (response.notificationData && response.notificationData.purchaseId) {
      return response.notificationData.purchaseId;
    }
    
    return null;
  };

  const purchaseId = getPurchaseId();

  return (
    <div className="space-y-4">
      <div 
        className={`p-4 rounded-lg ${
          error 
            ? 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800' 
            : 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800'
        }`}
        role="alert"
      >
        <h3 className={`font-semibold mb-2 ${
          error 
            ? 'text-red-800 dark:text-red-200' 
            : 'text-green-800 dark:text-green-200'
        }`}>
          {error ? '❌ Error' : '✅ Success'}
        </h3>
        <pre className={`text-xs overflow-x-auto ${
          error 
            ? 'text-red-700 dark:text-red-300' 
            : 'text-green-700 dark:text-green-300'
        }`}>
          {error || JSON.stringify(response, null, 2)}
        </pre>
      </div>

      {/* Display push notification status if this is a purchase */}
      {purchaseId && !error && (
        <PushNotificationStatus purchaseId={purchaseId} />
      )}
    </div>
  );
};

export default ResponseDisplay;