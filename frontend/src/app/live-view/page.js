'use client';

import { useState, useEffect } from 'react';
import { useLiveViewData } from '@/hooks/useLiveViewData';
import { useLiveViewWebSocket } from '@/hooks/useLiveViewWebSocket';
import AnimatedFlowDiagram from '@/components/LiveView/AnimatedFlowDiagram';

export default function LiveViewPage() {
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [realtimeRequests, setRealtimeRequests] = useState([]);
  
  // Data hooks
  const {
    systemStatus,
    components,
    requests,
    activeRequests,
    connectionStats,
    isConnected,
    fetchRequests
  } = useLiveViewData();

  // WebSocket for real-time updates
  const { socket, connectionStatus, eventCount } = useLiveViewWebSocket({
    onRequestNew: (request) => {
      console.log('📨 New request:', request);
      setRealtimeRequests(prev => [request, ...prev.slice(0, 49)]);
      fetchRequests(); // Refresh the requests list
    },
    onRequestProgress: (data) => {
      console.log('⚡ Request progress:', data);
      setRealtimeRequests(prev => 
        prev.map(req => req.id === data.requestId ? { ...req, ...data.request } : req)
      );
    },
    onRequestComplete: (request) => {
      console.log('✅ Request completed:', request);
      setRealtimeRequests(prev => 
        prev.map(req => req.id === request.id ? request : req)
      );
      fetchRequests(); // Refresh the requests list
    }
  });

  // Simulation function
  const handleSimulate = async (type = 'signup', count = 5, interval = 1000) => {
    if (simulationRunning) return;
    
    setSimulationRunning(true);
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
      const response = await fetch(`${API_BASE}/live-view/simulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, count, interval })
      });

      if (!response.ok) {
        throw new Error('Failed to start simulation');
      }

      const result = await response.json();
      console.log('🚀 Simulation started:', result);
      
      // Stop simulation after estimated duration
      setTimeout(() => {
        setSimulationRunning(false);
      }, result.estimatedDuration + 2000);
      
    } catch (error) {
      console.error('❌ Simulation failed:', error);
      setSimulationRunning(false);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      case 'processing': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Format duration
  const formatDuration = (ms) => {
    if (!ms) return '-';
    return ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  };

  // Combine and sort all requests
  const allRequests = [...(realtimeRequests || []), ...(requests || [])]
    .reduce((acc, req) => {
      const existing = acc.find(r => r.id === req.id);
      if (!existing) acc.push(req);
      else Object.assign(existing, req);
      return acc;
    }, [])
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
    .slice(0, 50);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Modern Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <span className="text-white text-lg">🚀</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Live View Dashboard</h1>
                  <p className="text-gray-600 text-sm">Real-time notification system monitoring</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className={`flex items-center space-x-2 px-3 py-2 rounded-full ${
                connectionStatus === 'connected' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}></div>
                <span className="text-sm font-medium">
                  {connectionStatus === 'connected' ? 'Live' : 'Offline'}
                </span>
              </div>

              {/* Event Counter */}
              <div className="bg-blue-100 text-blue-800 px-3 py-2 rounded-full">
                <span className="text-sm font-medium">{eventCount} events</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Total Requests</p>
                <p className="text-3xl font-bold text-gray-900">{systemStatus?.totalRequests || 0}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-blue-600 text-xl">📊</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Active Requests</p>
                <p className="text-3xl font-bold text-green-600">{systemStatus?.activeRequests || 0}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-green-600 text-xl">⚡</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Success Rate</p>
                <p className="text-3xl font-bold text-purple-600">
                  {systemStatus?.totalRequests > 0 
                    ? Math.round((1 - (systemStatus?.errorRate || 0) / 100) * 100)
                    : 100}%
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <span className="text-purple-600 text-xl">✨</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm">Avg Latency</p>
                <p className="text-3xl font-bold text-orange-600">
                  {formatDuration(systemStatus?.averageLatency || 0)}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <span className="text-orange-600 text-xl">⏱️</span>
              </div>
            </div>
          </div>
        </div>

        {/* Flow Diagram - Main Feature */}
        <div className="mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Live Request Flow</h2>
                <p className="text-gray-600 text-sm">Watch requests move through the system in real-time</p>
              </div>
              <button
                onClick={() => handleSimulate()}
                disabled={simulationRunning}
                className={`px-4 py-2 rounded-xl font-medium transition-all ${
                  simulationRunning
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
                }`}
              >
                {simulationRunning ? '⏳ Running...' : '🚀 Test Load'}
              </button>
            </div>
            
            <AnimatedFlowDiagram 
              requests={allRequests}
              onRequestSelect={setSelectedRequest}
            />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Request List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="p-6 border-b border-gray-100">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Recent Requests</h2>
                  <p className="text-gray-600 text-sm">Live request tracking and monitoring</p>
                </div>
              </div>
              
              <div className="p-6">
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {allRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-gray-400 text-2xl">📭</span>
                      </div>
                      <p className="text-gray-500">No requests yet. Click "Test Load" to simulate some requests!</p>
                    </div>
                  ) : (
                    allRequests.map((request) => (
                      <div 
                        key={request.id} 
                        className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                          selectedRequest?.id === request.id 
                            ? 'border-blue-300 bg-blue-50' 
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedRequest(request)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{request.type}</p>
                              <p className="text-gray-500 text-sm">
                                {new Date(request.startTime).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">
                              {formatDuration(request.totalDuration)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {request.stages?.length || 0} stages
                            </p>
                          </div>
                        </div>
                        
                        {/* Progress Bar */}
                        {request.status === 'processing' && (
                          <div className="mt-3">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{width: '60%'}}></div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Request Details & Controls */}
          <div className="space-y-6">
            {/* Quick Simulate Panel */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Simulate</h3>
              <div className="space-y-3">
                <button
                  onClick={() => handleSimulate('signup', 3, 500)}
                  disabled={simulationRunning}
                  className="w-full p-3 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors"
                >
                  📧 Simulate 3 Signups
                </button>
                <button
                  onClick={() => handleSimulate('login', 5, 300)}
                  disabled={simulationRunning}
                  className="w-full p-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors"
                >
                  🔐 Simulate 5 Logins
                </button>
                <button
                  onClick={() => handleSimulate('purchase', 2, 1000)}
                  disabled={simulationRunning}
                  className="w-full p-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl transition-colors"
                >
                  💳 Simulate 2 Purchases
                </button>
              </div>
            </div>

            {/* Selected Request Details */}
            {selectedRequest && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Request Details</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600">Request ID</p>
                    <p className="font-mono text-xs text-gray-900 break-all">{selectedRequest.id}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600">Type</p>
                    <p className="font-medium text-gray-900">{selectedRequest.type}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-gray-600">Duration</p>
                    <p className="font-medium text-gray-900">{formatDuration(selectedRequest.totalDuration)}</p>
                  </div>

                  {selectedRequest.stages && selectedRequest.stages.length > 0 && (
                    <div>
                      <p className="text-sm text-gray-600 mb-2">Processing Stages</p>
                      <div className="space-y-2">
                        {selectedRequest.stages.map((stage, index) => (
                          <div key={index} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center space-x-2">
                              <div className={`w-2 h-2 rounded-full ${
                                stage.status === 'completed' ? 'bg-green-500' : 
                                stage.status === 'failed' ? 'bg-red-500' : 
                                'bg-blue-500'
                              }`}></div>
                              <span className="text-sm font-medium">{stage.component}</span>
                            </div>
                            <span className="text-xs text-gray-500">{formatDuration(stage.duration)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* System Health */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">System Health</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    systemStatus?.status === 'healthy' ? 'bg-green-100 text-green-800' :
                    systemStatus?.status === 'degraded' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {systemStatus?.status || 'unknown'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Uptime</span>
                  <span className="text-sm font-medium">
                    {systemStatus?.uptime ? Math.round(systemStatus.uptime / 1000 / 60) + 'm' : '-'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">WebSocket</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    connectionStatus === 'connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {connectionStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}