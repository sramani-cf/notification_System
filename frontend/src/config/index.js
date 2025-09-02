const config = {
  api: {
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT) || 30000,
  },
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME || 'Notification System',
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
  features: {
    enableAnalytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
    enableDebugMode: process.env.NEXT_PUBLIC_DEBUG_MODE === 'true',
    maxNotificationHistory: parseInt(process.env.NEXT_PUBLIC_MAX_HISTORY) || 10,
  },
  ui: {
    theme: process.env.NEXT_PUBLIC_THEME || 'auto',
    animationsEnabled: process.env.NEXT_PUBLIC_ANIMATIONS !== 'false',
  }
};

export default config;