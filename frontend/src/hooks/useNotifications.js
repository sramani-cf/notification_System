'use client';

import { useState, useCallback } from 'react';
import notificationService from '@/services/notificationService';
import { MAX_NOTIFICATION_HISTORY } from '@/constants';

export const useNotifications = () => {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [sentNotifications, setSentNotifications] = useState([]);

  const sendNotification = useCallback(async (type) => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await notificationService.sendNotification(type);
      setResponse(result);
      
      setSentNotifications(prev => [{
        ...result.data,
        id: Date.now(),
        status: 'success',
        sentAt: new Date().toLocaleTimeString(),
      }, ...prev].slice(0, MAX_NOTIFICATION_HISTORY));

      return result;
    } catch (err) {
      setError(err.message);
      setSentNotifications(prev => [{
        type,
        id: Date.now(),
        status: 'error',
        error: err.message,
        sentAt: new Date().toLocaleTimeString(),
      }, ...prev].slice(0, MAX_NOTIFICATION_HISTORY));
      
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setSentNotifications([]);
    setResponse(null);
    setError(null);
  }, []);

  const retryFailed = useCallback(async () => {
    setLoading(true);
    try {
      const result = await notificationService.retryFailedNotifications();
      setResponse(result);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    response,
    error,
    sentNotifications,
    sendNotification,
    clearHistory,
    retryFailed,
    hasNotifications: sentNotifications.length > 0,
  };
};