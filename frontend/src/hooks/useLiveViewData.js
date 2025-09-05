'use client';

import { useState, useEffect, useCallback } from 'react';

export function useLiveViewData() {
  const [systemStatus, setSystemStatus] = useState({});
  const [components, setComponents] = useState({});
  const [requests, setRequests] = useState([]);
  const [activeRequests, setActiveRequests] = useState([]);
  const [connectionStats, setConnectionStats] = useState({});
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // API base URL - adjust based on your backend configuration
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

  const fetchData = useCallback(async (endpoint) => {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch ${endpoint}:`, error);
      throw error;
    }
  }, [API_BASE]);

  // Fetch system status and metrics
  const fetchSystemStatus = useCallback(async () => {
    try {
      const data = await fetchData('/live-view/status');
      setSystemStatus(data.system || {});
      setComponents(data.components || {});
      setActiveRequests(data.activeRequests || 0);
      setConnectionStats(data.connections || {});
      setError(null);
      setIsConnected(true);
    } catch (error) {
      setError(error.message);
      setIsConnected(false);
    }
  }, [fetchData]);

  // Fetch recent requests
  const fetchRequests = useCallback(async () => {
    try {
      const data = await fetchData('/live-view/requests?limit=100');
      setRequests(data.requests || []);
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    }
  }, [fetchData]);

  // Fetch component details
  const fetchComponentDetails = useCallback(async (componentName) => {
    try {
      const data = await fetchData(`/live-view/components/${componentName}`);
      return data;
    } catch (error) {
      console.error(`Failed to fetch component ${componentName}:`, error);
      return null;
    }
  }, [fetchData]);

  // Initialize data
  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchSystemStatus(),
          fetchRequests()
        ]);
      } catch (error) {
        console.error('Failed to initialize live view data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeData();
  }, [fetchSystemStatus, fetchRequests]);

  // Set up polling for real-time updates (fallback if WebSocket is not available)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (!isConnected) {
        fetchSystemStatus();
        fetchRequests();
      }
    }, 5000); // Poll every 5 seconds when not connected via WebSocket

    return () => clearInterval(pollInterval);
  }, [isConnected, fetchSystemStatus, fetchRequests]);

  // Update request in the list
  const updateRequest = useCallback((updatedRequest) => {
    setRequests(prev => {
      const index = prev.findIndex(r => r.id === updatedRequest.id);
      if (index >= 0) {
        const newRequests = [...prev];
        newRequests[index] = updatedRequest;
        return newRequests;
      } else {
        // Add new request to the beginning of the list
        return [updatedRequest, ...prev.slice(0, 99)]; // Keep only latest 100
      }
    });
  }, []);

  // Add new request
  const addRequest = useCallback((newRequest) => {
    setRequests(prev => [newRequest, ...prev.slice(0, 99)]);
  }, []);

  // Remove request
  const removeRequest = useCallback((requestId) => {
    setRequests(prev => prev.filter(r => r.id !== requestId));
  }, []);

  // Update component metrics
  const updateComponent = useCallback((componentName, metrics) => {
    setComponents(prev => ({
      ...prev,
      [componentName]: metrics
    }));
  }, []);

  // Update system metrics
  const updateSystemMetrics = useCallback((metrics) => {
    setSystemStatus(metrics);
  }, []);

  // Clear all data
  const clearData = useCallback(() => {
    setRequests([]);
    setComponents({});
    setSystemStatus({});
    setConnectionStats({});
  }, []);

  // Get filtered requests
  const getFilteredRequests = useCallback((filters = {}) => {
    let filtered = requests;

    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(r => r.status === filters.status);
    }

    if (filters.type && filters.type !== 'all') {
      filtered = filtered.filter(r => r.type === filters.type);
    }

    if (filters.timeRange) {
      const now = new Date();
      const timeLimit = new Date(now.getTime() - filters.timeRange);
      filtered = filtered.filter(r => new Date(r.startTime) > timeLimit);
    }

    return filtered;
  }, [requests]);

  // Get request statistics
  const getRequestStats = useCallback(() => {
    const stats = {
      total: requests.length,
      processing: 0,
      completed: 0,
      failed: 0,
      byType: {}
    };

    requests.forEach(request => {
      // Count by status
      if (request.status === 'processing') stats.processing++;
      else if (request.status === 'completed') stats.completed++;
      else if (request.status === 'failed') stats.failed++;

      // Count by type
      stats.byType[request.type] = (stats.byType[request.type] || 0) + 1;
    });

    return stats;
  }, [requests]);

  // Get component health summary
  const getComponentHealth = useCallback(() => {
    const componentNames = Object.keys(components);
    const health = {
      total: componentNames.length,
      healthy: 0,
      degraded: 0,
      critical: 0,
      unknown: 0
    };

    componentNames.forEach(name => {
      const status = components[name]?.status || 'unknown';
      health[status]++;
    });

    return health;
  }, [components]);

  return {
    // Data
    systemStatus,
    components,
    requests,
    activeRequests,
    connectionStats,
    
    // Connection status
    isConnected,
    isLoading,
    error,
    
    // Methods
    fetchSystemStatus,
    fetchRequests,
    fetchComponentDetails,
    updateRequest,
    addRequest,
    removeRequest,
    updateComponent,
    updateSystemMetrics,
    clearData,
    
    // Computed data
    getFilteredRequests,
    getRequestStats,
    getComponentHealth,
    
    // Direct API access
    fetchData
  };
}