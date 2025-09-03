'use client';

import { useState, useCallback } from 'react';
import notificationService from '@/services/notificationService';
import { MAX_NOTIFICATION_HISTORY } from '@/constants';

export const useNotifications = () => {
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, type: null });
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [sentNotifications, setSentNotifications] = useState([]);
  const [clickCounters, setClickCounters] = useState({
    signup: 0,
    login: 0,
    reset_password: 0,
    purchase: 0,
    friendRequest: 0
  });
  const [bulkCount, setBulkCount] = useState(50);
  const [stopBulkOperation, setStopBulkOperation] = useState(false);

  const sendNotification = useCallback(async (type) => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await notificationService.sendNotification(type);
      setResponse(result);
      
      // Update click counter
      setClickCounters(prev => ({
        ...prev,
        [type]: prev[type] + 1
      }));
      
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

  const sendBulkNotification = useCallback(async (type, count = bulkCount) => {
    setBulkLoading(true);
    setBulkProgress({ current: 0, total: count, type });
    setStopBulkOperation(false);
    setError(null);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      for (let i = 0; i < count && !stopBulkOperation; i++) {
        setBulkProgress(prev => ({ ...prev, current: i + 1 }));
        
        try {
          await notificationService.sendNotification(type);
          successCount++;
          
          // Update click counter
          setClickCounters(prev => ({
            ...prev,
            [type]: prev[type] + 1
          }));
          
          // Small delay to prevent overwhelming the server
          if (i < count - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (err) {
          errorCount++;
          errors.push(err.message);
        }
      }

      const result = {
        type,
        total: count,
        successful: successCount,
        failed: errorCount,
        stopped: stopBulkOperation,
        errors: errors.slice(0, 5) // Keep only first 5 errors
      };

      setResponse(result);
      
      // Add bulk operation to history
      setSentNotifications(prev => [{
        ...result,
        id: Date.now(),
        status: errorCount === 0 ? 'success' : 'partial',
        sentAt: new Date().toLocaleTimeString(),
        isBulk: true
      }, ...prev].slice(0, MAX_NOTIFICATION_HISTORY));

      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBulkLoading(false);
      setBulkProgress({ current: 0, total: 0, type: null });
      setStopBulkOperation(false);
    }
  }, [bulkCount, stopBulkOperation]);

  const stopBulk = useCallback(() => {
    setStopBulkOperation(true);
  }, []);

  const clearHistory = useCallback(() => {
    setSentNotifications([]);
    setResponse(null);
    setError(null);
  }, []);

  const clearCounters = useCallback(() => {
    setClickCounters({
      signup: 0,
      login: 0,
      reset_password: 0,
      purchase: 0,
      friendRequest: 0
    });
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
    bulkLoading,
    bulkProgress,
    response,
    error,
    sentNotifications,
    clickCounters,
    bulkCount,
    sendNotification,
    sendBulkNotification,
    stopBulk,
    clearHistory,
    clearCounters,
    setBulkCount,
    retryFailed,
    hasNotifications: sentNotifications.length > 0,
    totalClicks: Object.values(clickCounters).reduce((sum, count) => sum + count, 0)
  };
};