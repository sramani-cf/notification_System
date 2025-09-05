'use client';

import { useState, useEffect } from 'react';

const AnimatedFlowDiagram = ({ requests, onRequestSelect }) => {
  const [animatingRequests, setAnimatingRequests] = useState(new Map());
  
  // Flow stages configuration
  const stages = [
    { id: 'client', name: 'Client', icon: '💻', color: 'blue', x: 50, y: 200 },
    { id: 'load-balancer', name: 'Load Balancer', icon: '⚖️', color: 'purple', x: 200, y: 200 },
    { id: 'server', name: 'Server', icon: '🖥️', color: 'green', x: 350, y: 200 },
    { id: 'controller', name: 'Controller', icon: '🎛️', color: 'orange', x: 500, y: 200 },
    { id: 'queue', name: 'Queue', icon: '📤', color: 'yellow', x: 650, y: 200 },
    { id: 'worker', name: 'Worker', icon: '👷', color: 'red', x: 800, y: 200 }
  ];

  // Connection paths between stages
  const connections = [];
  for (let i = 0; i < stages.length - 1; i++) {
    connections.push({
      from: stages[i],
      to: stages[i + 1]
    });
  }

  // Color mapping for stages
  const getStageColor = (colorName) => {
    const colors = {
      blue: { bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-700', accent: 'bg-blue-500' },
      purple: { bg: 'bg-purple-100', border: 'border-purple-300', text: 'text-purple-700', accent: 'bg-purple-500' },
      green: { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-700', accent: 'bg-green-500' },
      orange: { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-700', accent: 'bg-orange-500' },
      yellow: { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-700', accent: 'bg-yellow-500' },
      red: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-700', accent: 'bg-red-500' }
    };
    return colors[colorName] || colors.blue;
  };

  // Track active requests and their current stages
  useEffect(() => {
    if (!requests || requests.length === 0) return;

    const activeReqs = requests
      .filter(req => req.status === 'processing' || req.status === 'initiated')
      .slice(0, 5); // Limit to 5 concurrent animations

    const newAnimatingRequests = new Map();
    
    activeReqs.forEach(req => {
      const currentStage = req.currentStage || 'client';
      const stageIndex = stages.findIndex(s => s.id === currentStage);
      
      newAnimatingRequests.set(req.id, {
        request: req,
        currentStageIndex: Math.max(0, stageIndex),
        startTime: Date.now(),
        color: getRandomColor()
      });
    });

    setAnimatingRequests(newAnimatingRequests);
  }, [requests]);

  // Get random color for request dots
  const getRandomColor = () => {
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500', 'bg-yellow-500', 'bg-pink-500'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Calculate position for animated dots
  const getAnimatedPosition = (fromStage, toStage, progress) => {
    const deltaX = toStage.x - fromStage.x;
    const deltaY = toStage.y - fromStage.y;
    return {
      x: fromStage.x + (deltaX * progress),
      y: fromStage.y + (deltaY * progress)
    };
  };

  // Get request count at each stage
  const getStageRequestCount = (stageId) => {
    if (!requests) return 0;
    return requests.filter(req => {
      const stage = req.stages?.find(s => s.stage === stageId);
      return stage && stage.status === 'processing';
    }).length;
  };

  // Get stage status based on recent activity
  const getStageStatus = (stageId) => {
    if (!requests) return 'idle';
    
    const recentRequests = requests
      .filter(req => Date.now() - new Date(req.startTime).getTime() < 30000) // Last 30 seconds
      .filter(req => req.stages?.some(s => s.stage === stageId));
    
    if (recentRequests.length > 0) return 'active';
    return 'idle';
  };

  return (
    <div className="w-full h-96 bg-gradient-to-br from-gray-50 to-blue-50 rounded-2xl border border-gray-200 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-30">
        <svg className="w-full h-full">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Flow title */}
      <div className="absolute top-4 left-6">
        <h3 className="text-lg font-bold text-gray-900">Request Flow Visualization</h3>
        <p className="text-sm text-gray-600">Real-time processing pipeline</p>
      </div>

      {/* Stage connections */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {connections.map((conn, index) => (
          <g key={index}>
            {/* Connection line */}
            <line
              x1={conn.from.x + 40}
              y1={conn.from.y}
              x2={conn.to.x - 40}
              y2={conn.to.y}
              stroke="#d1d5db"
              strokeWidth="3"
              strokeDasharray="5,5"
            />
            {/* Arrow */}
            <polygon
              points={`${conn.to.x - 45},${conn.to.y - 5} ${conn.to.x - 45},${conn.to.y + 5} ${conn.to.x - 35},${conn.to.y}`}
              fill="#9ca3af"
            />
          </g>
        ))}
      </svg>

      {/* Stage nodes */}
      {stages.map((stage) => {
        const colors = getStageColor(stage.color);
        const status = getStageStatus(stage.id);
        const count = getStageRequestCount(stage.id);
        
        return (
          <div
            key={stage.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2"
            style={{ left: stage.x, top: stage.y }}
          >
            {/* Stage node */}
            <div className={`
              w-20 h-20 rounded-2xl border-2 ${colors.bg} ${colors.border}
              flex flex-col items-center justify-center cursor-pointer
              transition-all duration-300 hover:scale-105 hover:shadow-lg
              ${status === 'active' ? 'animate-pulse ring-2 ring-blue-300' : ''}
            `}>
              <span className="text-2xl mb-1">{stage.icon}</span>
              <div className="text-xs font-medium text-gray-700 text-center">
                {stage.name}
              </div>
              
              {/* Request counter */}
              {count > 0 && (
                <div className={`absolute -top-2 -right-2 w-6 h-6 ${colors.accent} text-white text-xs rounded-full flex items-center justify-center font-bold`}>
                  {count}
                </div>
              )}
            </div>

            {/* Stage info tooltip */}
            <div className={`
              absolute top-24 left-1/2 transform -translate-x-1/2 
              bg-gray-900 text-white text-xs px-2 py-1 rounded
              opacity-0 hover:opacity-100 transition-opacity whitespace-nowrap z-10
            `}>
              {stage.name} • {status === 'active' ? 'Processing' : 'Idle'}
            </div>
          </div>
        );
      })}

      {/* Animated request dots */}
      {Array.from(animatingRequests.entries()).map(([requestId, data], index) => {
        const currentStage = stages[data.currentStageIndex];
        const nextStage = stages[data.currentStageIndex + 1];
        
        if (!currentStage) return null;

        // Animate between stages if there's a next stage
        const progress = nextStage ? 
          Math.min(1, (Date.now() - data.startTime) / 2000) : // 2 second transition
          0;

        const position = nextStage && progress < 1 ? 
          getAnimatedPosition(currentStage, nextStage, progress) :
          { x: currentStage.x, y: currentStage.y };

        return (
          <div
            key={requestId}
            className={`
              absolute w-3 h-3 ${data.color} rounded-full
              transform -translate-x-1/2 -translate-y-1/2
              shadow-lg animate-bounce cursor-pointer z-20
            `}
            style={{ 
              left: position.x, 
              top: position.y - (index * 8), // Stack multiple dots
              animationDelay: `${index * 0.1}s`
            }}
            onClick={() => onRequestSelect?.(data.request)}
            title={`${data.request.type} - ${data.request.status}`}
          >
            {/* Ripple effect */}
            <div className={`absolute inset-0 ${data.color} rounded-full opacity-30 animate-ping`}></div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="absolute bottom-4 right-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 border border-gray-200">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Legend</h4>
          <div className="flex items-center space-x-4 text-xs text-gray-600">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
              <span>Active Request</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-gray-200 border-2 border-blue-300 rounded-full animate-pulse"></div>
              <span>Processing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance stats overlay */}
      <div className="absolute top-4 right-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-3 border border-gray-200">
          <div className="text-xs text-gray-600">
            <div className="flex justify-between items-center">
              <span>Active:</span>
              <span className="font-semibold text-blue-600">{animatingRequests.size}</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span>Total:</span>
              <span className="font-semibold text-gray-700">{requests?.length || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnimatedFlowDiagram;