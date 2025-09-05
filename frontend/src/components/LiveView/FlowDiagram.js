'use client';

import { useState, useEffect, useRef } from 'react';

const COMPONENT_POSITIONS = {
  'LoadBalancer': { x: 50, y: 100, width: 120, height: 60 },
  'SERVER-1': { x: 30, y: 220, width: 80, height: 50 },
  'SERVER-2': { x: 130, y: 220, width: 80, height: 50 },
  'SERVER-3': { x: 230, y: 220, width: 80, height: 50 },
  'Database': { x: 50, y: 340, width: 100, height: 50 },
  'NotificationService': { x: 200, y: 340, width: 120, height: 50 },
  'QueueManager': { x: 30, y: 460, width: 100, height: 50 },
  'WebSocketService': { x: 180, y: 460, width: 120, height: 50 },
  'MailWorker': { x: 30, y: 580, width: 90, height: 50 },
  'InAppWorker': { x: 180, y: 580, width: 90, height: 50 },
  'EmailService': { x: 30, y: 700, width: 90, height: 50 },
  'ClientDelivery': { x: 180, y: 700, width: 100, height: 50 }
};

const COMPONENT_COLORS = {
  'LoadBalancer': '#8B5CF6',
  'SERVER-1': '#06B6D4',
  'SERVER-2': '#06B6D4', 
  'SERVER-3': '#06B6D4',
  'Database': '#EC4899',
  'NotificationService': '#F97316',
  'QueueManager': '#F97316',
  'WebSocketService': '#10B981',
  'MailWorker': '#84CC16',
  'InAppWorker': '#84CC16',
  'EmailService': '#3B82F6',
  'ClientDelivery': '#10B981'
};

const FLOW_PATHS = {
  // Email notification flow
  'email': [
    { from: 'LoadBalancer', to: 'SERVER-1', stage: 'load-balancer:routing' },
    { from: 'SERVER-1', to: 'Database', stage: 'database:query' },
    { from: 'SERVER-1', to: 'NotificationService', stage: 'notification:created' },
    { from: 'NotificationService', to: 'QueueManager', stage: 'queue:added' },
    { from: 'QueueManager', to: 'MailWorker', stage: 'worker:processing' },
    { from: 'MailWorker', to: 'EmailService', stage: 'email:sending' },
    { from: 'EmailService', to: 'ClientDelivery', stage: 'email:delivered' }
  ],
  // In-app notification flow
  'inapp': [
    { from: 'LoadBalancer', to: 'SERVER-2', stage: 'load-balancer:routing' },
    { from: 'SERVER-2', to: 'Database', stage: 'database:query' },
    { from: 'SERVER-2', to: 'NotificationService', stage: 'notification:created' },
    { from: 'NotificationService', to: 'QueueManager', stage: 'queue:added' },
    { from: 'QueueManager', to: 'InAppWorker', stage: 'worker:processing' },
    { from: 'InAppWorker', to: 'WebSocketService', stage: 'websocket:sending' },
    { from: 'WebSocketService', to: 'ClientDelivery', stage: 'websocket:delivered' }
  ],
  // Dual notification flow (both email and in-app)
  'dual': [
    { from: 'LoadBalancer', to: 'SERVER-3', stage: 'load-balancer:routing' },
    { from: 'SERVER-3', to: 'Database', stage: 'database:query' },
    { from: 'SERVER-3', to: 'NotificationService', stage: 'notification:created' },
    { from: 'NotificationService', to: 'QueueManager', stage: 'queue:added', branches: ['email', 'inapp'] },
    { from: 'NotificationService', to: 'WebSocketService', stage: 'websocket:direct' },
    // Email branch
    { from: 'QueueManager', to: 'MailWorker', stage: 'worker:processing', branch: 'email' },
    { from: 'MailWorker', to: 'EmailService', stage: 'email:sending', branch: 'email' },
    // In-app branch  
    { from: 'QueueManager', to: 'InAppWorker', stage: 'worker:processing', branch: 'inapp' },
    { from: 'InAppWorker', to: 'WebSocketService', stage: 'websocket:sending', branch: 'inapp' },
    // Final delivery
    { from: 'EmailService', to: 'ClientDelivery', stage: 'email:delivered', branch: 'email' },
    { from: 'WebSocketService', to: 'ClientDelivery', stage: 'websocket:delivered', branch: 'inapp' }
  ]
};

// Static connection lines for visual reference
const STATIC_CONNECTIONS = [
  { from: 'LoadBalancer', to: 'SERVER-1', type: 'request' },
  { from: 'LoadBalancer', to: 'SERVER-2', type: 'request' },
  { from: 'LoadBalancer', to: 'SERVER-3', type: 'request' },
  { from: 'SERVER-1', to: 'Database', type: 'data' },
  { from: 'SERVER-2', to: 'Database', type: 'data' },
  { from: 'SERVER-3', to: 'Database', type: 'data' },
  { from: 'SERVER-1', to: 'NotificationService', type: 'notification' },
  { from: 'SERVER-2', to: 'NotificationService', type: 'notification' },
  { from: 'SERVER-3', to: 'NotificationService', type: 'notification' },
  { from: 'NotificationService', to: 'QueueManager', type: 'queue' },
  { from: 'NotificationService', to: 'WebSocketService', type: 'websocket' },
  { from: 'QueueManager', to: 'MailWorker', type: 'email' },
  { from: 'QueueManager', to: 'InAppWorker', type: 'inapp' },
  { from: 'MailWorker', to: 'EmailService', type: 'email' },
  { from: 'InAppWorker', to: 'WebSocketService', type: 'inapp' },
  { from: 'WebSocketService', to: 'ClientDelivery', type: 'websocket' },
  { from: 'EmailService', to: 'ClientDelivery', type: 'email' }
];

export default function FlowDiagram({ 
  components = {}, 
  requests = [], 
  controlSettings = {},
  onRequestSelect 
}) {
  const svgRef = useRef(null);
  const [animatingRequests, setAnimatingRequests] = useState(new Map());
  const [hoveredComponent, setHoveredComponent] = useState(null);
  const [requestPulses, setRequestPulses] = useState(new Map());

  // Enhanced request animation with stage tracking
  useEffect(() => {
    const activeRequests = requests.filter(r => r.status === 'processing');
    
    activeRequests.forEach(request => {
      if (!animatingRequests.has(request.id)) {
        animateRequest(request);
      } else {
        // Update existing animation if request stage changed
        const existingAnim = animatingRequests.get(request.id);
        if (existingAnim.currentStage !== request.currentStage) {
          updateRequestStage(request.id, request.currentStage, request.stages);
        }
      }
    });
  }, [requests]);

  const animateRequest = (request) => {
    const notificationType = request.metadata?.notificationType || request.type;
    const hasEmail = request.stages?.some(s => s.component.includes('MAIL') || s.component.includes('EMAIL'));
    const hasInApp = request.stages?.some(s => s.component.includes('WEBSOCKET') || s.component.includes('INAPP'));
    
    // Determine flow type based on stages
    let flowType = 'email';
    if (hasEmail && hasInApp) flowType = 'dual';
    else if (hasInApp && !hasEmail) flowType = 'inapp';
    
    const flowPath = FLOW_PATHS[flowType] || FLOW_PATHS['email'];
    
    setAnimatingRequests(prev => new Map(prev.set(request.id, {
      id: request.id,
      currentStage: request.currentStage,
      type: notificationType,
      flowType: flowType,
      startTime: Date.now(),
      stages: request.stages || [],
      pathIndex: 0,
      progress: 0,
      branches: flowType === 'dual' ? ['email', 'inapp'] : []
    })));

    // Add pulse effect when request starts
    addRequestPulse(request.id, 'LoadBalancer');

    // Remove after animation completes (longer for dual flows)
    const duration = flowType === 'dual' ? 12000 : 8000;
    setTimeout(() => {
      setAnimatingRequests(prev => {
        const next = new Map(prev);
        next.delete(request.id);
        return next;
      });
    }, duration);
  };

  const updateRequestStage = (requestId, newStage, stages) => {
    setAnimatingRequests(prev => {
      const existing = prev.get(requestId);
      if (!existing) return prev;
      
      // Find the component for this stage
      const currentStageData = stages?.find(s => s.stage === newStage);
      if (currentStageData) {
        addRequestPulse(requestId, currentStageData.component);
      }
      
      return new Map(prev.set(requestId, {
        ...existing,
        currentStage: newStage,
        stages: stages
      }));
    });
  };

  const addRequestPulse = (requestId, component) => {
    setRequestPulses(prev => {
      const pulses = new Map(prev);
      const pulseKey = `${requestId}-${component}`;
      pulses.set(pulseKey, { requestId, component, startTime: Date.now() });
      
      // Remove pulse after animation
      setTimeout(() => {
        setRequestPulses(p => {
          const updated = new Map(p);
          updated.delete(pulseKey);
          return updated;
        });
      }, 1500);
      
      return pulses;
    });
  };

  const getComponentStatus = (componentName) => {
    const component = components[componentName];
    if (!component) return 'unknown';
    
    if (component.status === 'healthy') return 'healthy';
    if (component.status === 'degraded') return 'degraded';
    if (component.status === 'critical') return 'critical';
    return 'unknown';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'healthy': return '#10B981';
      case 'degraded': return '#F59E0B';
      case 'critical': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const handleComponentClick = (componentName) => {
    console.log('Component clicked:', componentName);
    // Could open component details modal
  };

  const renderComponent = (name, position) => {
    const status = getComponentStatus(name);
    const baseColor = COMPONENT_COLORS[name] || '#6B7280';
    const statusColor = getStatusColor(status);
    const isHovered = hoveredComponent === name;
    const component = components[name];
    
    // Check for active pulses on this component
    const activePulses = Array.from(requestPulses.values()).filter(p => 
      p.component === name || p.component.includes(name.toUpperCase())
    );
    const hasPulse = activePulses.length > 0;

    return (
      <g key={name}>
        {/* Pulse Effect */}
        {hasPulse && (
          <circle
            cx={position.x + position.width / 2}
            cy={position.y + position.height / 2}
            r={Math.max(position.width, position.height) / 2 + 10}
            fill="none"
            stroke={baseColor}
            strokeWidth={2}
            opacity={0.4}
            className="animate-ping"
          />
        )}
        
        {/* Component Box */}
        <rect
          x={position.x}
          y={position.y}
          width={position.width}
          height={position.height}
          fill={baseColor}
          stroke={statusColor}
          strokeWidth={isHovered ? 3 : hasPulse ? 3 : 2}
          rx={8}
          className="cursor-pointer transition-all duration-200"
          style={{
            opacity: isHovered ? 0.9 : hasPulse ? 0.95 : 0.8,
            filter: isHovered || hasPulse ? 'brightness(1.1)' : 'none'
          }}
          onMouseEnter={() => setHoveredComponent(name)}
          onMouseLeave={() => setHoveredComponent(null)}
          onClick={() => handleComponentClick(name)}
        />
        
        {/* Processing Activity Indicator */}
        {hasPulse && (
          <circle
            cx={position.x + 8}
            cy={position.y + 8}
            r={3}
            fill="#10B981"
            className="animate-pulse"
          />
        )}
        
        {/* Status Indicator */}
        <circle
          cx={position.x + position.width - 10}
          cy={position.y + 10}
          r={6}
          fill={statusColor}
          stroke="white"
          strokeWidth={2}
        />
        
        {/* Component Name */}
        <text
          x={position.x + position.width / 2}
          y={position.y + position.height / 2 - 5}
          textAnchor="middle\"
          fill="white\"
          fontSize={12}
          fontWeight="bold\"
          style={{ userSelect: 'none' }}
        >
          {name === 'NotificationService' ? 'Notification' : 
           name === 'WebSocketService' ? 'WebSocket' :
           name === 'QueueManager' ? 'Queue Mgr' :
           name === 'EmailService' ? 'Email SMTP' :
           name === 'ClientDelivery' ? 'Client' :
           name}
        </text>
        
        {/* Metrics */}
        {component && (
          <text
            x={position.x + position.width / 2}
            y={position.y + position.height / 2 + 8}
            textAnchor="middle\"
            fill="white\"
            fontSize={10}
            style={{ userSelect: 'none' }}
          >
            {component.activeConnections !== undefined && `${component.activeConnections} conn`}
            {component.uptime !== undefined && `${Math.floor(component.uptime / 1000)}s`}
            {component.totalServers !== undefined && `${component.healthyServers}/${component.totalServers}`}
          </text>
        )}
        
        {/* Active Request Count */}
        {activePulses.length > 1 && (
          <text
            x={position.x + position.width - 8}
            y={position.y + position.height - 5}
            textAnchor="middle"
            fill="#10B981"
            fontSize={10}
            fontWeight="bold"
          >
            {activePulses.length}
          </text>
        )}
      </g>
    );
  };

  const renderConnection = (path) => {
    const from = COMPONENT_POSITIONS[path.from];
    const to = COMPONENT_POSITIONS[path.to];
    
    if (!from || !to) return null;

    const fromX = from.x + from.width / 2;
    const fromY = from.y + from.height;
    const toX = to.x + to.width / 2;
    const toY = to.y;

    // Calculate control points for curved line
    const midY = fromY + (toY - fromY) / 2;
    const controlPoint1X = fromX;
    const controlPoint1Y = midY;
    const controlPoint2X = toX;
    const controlPoint2Y = midY;

    const pathData = `M ${fromX} ${fromY} C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${toX} ${toY}`;

    const getPathColor = (type) => {
      switch (type) {
        case 'email': return '#3B82F6';
        case 'inapp': return '#10B981';
        case 'websocket': return '#10B981';
        case 'queue': return '#F97316';
        case 'notification': return '#F97316';
        case 'data': return '#EC4899';
        default: return '#6B7280';
      }
    };

    return (
      <g key={`${path.from}-${path.to}`}>
        {/* Connection Line */}
        <path
          d={pathData}
          stroke={getPathColor(path.type)}
          strokeWidth={2}
          fill="none\"
          strokeDasharray={path.type === 'websocket' ? '5,5' : 'none'}
          opacity={0.6}
        />
        
        {/* Arrow */}
        <polygon
          points={`${toX-4},${toY-8} ${toX+4},${toY-8} ${toX},${toY}`}
          fill={getPathColor(path.type)}
          opacity={0.8}
        />
      </g>
    );
  };

  const renderAnimatingRequest = (requestAnim) => {
    const flowPath = FLOW_PATHS[requestAnim.flowType] || FLOW_PATHS['email'];
    const totalDuration = requestAnim.flowType === 'dual' ? 12000 : 8000;
    const elapsed = Date.now() - requestAnim.startTime;
    const progress = Math.min(elapsed / totalDuration, 1);
    
    const pathIndex = Math.floor(progress * flowPath.length);
    const currentPath = flowPath[pathIndex];
    
    if (!currentPath || progress >= 1) return null;

    const from = COMPONENT_POSITIONS[currentPath.from];
    const to = COMPONENT_POSITIONS[currentPath.to];
    
    if (!from || !to) return null;

    const fromX = from.x + from.width / 2;
    const fromY = from.y + from.height;
    const toX = to.x + to.width / 2;
    const toY = to.y;

    const localProgress = (progress * flowPath.length) % 1;
    const x = fromX + (toX - fromX) * localProgress;
    const y = fromY + (toY - fromY) * localProgress;

    const getRequestColor = (type) => {
      switch (type) {
        case 'signup': return '#10B981';
        case 'login': return '#3B82F6';
        case 'reset_password': return '#F59E0B';
        case 'purchase': return '#8B5CF6';
        case 'friend_request': return '#EC4899';
        default: return '#6B7280';
      }
    };

    const color = getRequestColor(requestAnim.type);
    const stageText = requestAnim.currentStage || currentPath.stage || 'processing';

    return (
      <g key={`anim-${requestAnim.id}`}>
        {/* Main request bubble */}
        <circle
          cx={x}
          cy={y}
          r={8}
          fill={color}
          stroke="white"
          strokeWidth={2}
          className="cursor-pointer"
          style={{ 
            opacity: 0.9,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
          }}
          onClick={() => onRequestSelect?.(requestAnim.id)}
        />
        
        {/* Pulsing outer ring */}
        <circle
          cx={x}
          cy={y}
          r={12}
          fill="none"
          stroke={color}
          strokeWidth={1}
          opacity={0.4}
          className="animate-ping"
        />
        
        {/* Request type label */}
        <text
          x={x}
          y={y - 15}
          textAnchor="middle"
          fill={color}
          fontSize={9}
          fontWeight="bold"
          style={{ 
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            userSelect: 'none'
          }}
        >
          {requestAnim.type.slice(0, 3).toUpperCase()}
        </text>
        
        {/* Current stage indicator */}
        <text
          x={x}
          y={y + 20}
          textAnchor="middle"
          fill="#374151"
          fontSize={7}
          style={{ 
            userSelect: 'none',
            opacity: 0.8
          }}
        >
          {stageText.split(':')[1] || stageText}
        </text>
        
        {/* Branch indicators for dual flows */}
        {requestAnim.flowType === 'dual' && pathIndex > 3 && currentPath.branch && (
          <circle
            cx={x + (currentPath.branch === 'email' ? -6 : 6)}
            cy={y}
            r={3}
            fill={currentPath.branch === 'email' ? '#3B82F6' : '#10B981'}
            opacity={0.7}
          />
        )}
      </g>
    );
  };

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden relative">
      {/* Controls Overlay */}
      <div className="absolute top-4 right-4 z-10 flex space-x-2">
        <button className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
          Reset View
        </button>
        <button className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700">
          Export PNG
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Legend</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-gray-600 dark:text-gray-300">Healthy</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-gray-600 dark:text-gray-300">Degraded</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-gray-600 dark:text-gray-300">Critical</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-gray-600 dark:text-gray-300">Request</span>
          </div>
        </div>
      </div>

      {/* SVG Flow Diagram */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 350 800"
        className="w-full h-full"
      >
        {/* Grid Background */}
        <defs>
          <pattern
            id="grid"
            width={20}
            height={20}
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              stroke="#f3f4f6"
              strokeWidth={1}
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Render Connections */}
        {STATIC_CONNECTIONS.map(renderConnection)}

        {/* Render Components */}
        {Object.entries(COMPONENT_POSITIONS).map(([name, position]) =>
          renderComponent(name, position)
        )}

        {/* Render Animating Requests */}
        {Array.from(animatingRequests.values()).map(renderAnimatingRequest)}
      </svg>

      {/* Stats Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Live Stats</h4>
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Active Requests:</span>
            <span className="font-medium text-blue-600 dark:text-blue-400">{animatingRequests.size}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-300">Components:</span>
            <span className="font-medium text-green-600 dark:text-green-400">{Object.keys(components).length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}