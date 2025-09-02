module.exports = {
  NOTIFICATION_TYPES: {
    SIGNUP: 'signup',
    LOGIN: 'login',
    RESET_PASSWORD: 'reset_password',
    PURCHASE: 'purchase',
    FRIEND_REQUEST: 'friend_request'
  },
  
  NOTIFICATION_STATUS: {
    PENDING: 'pending',
    SENT: 'sent',
    FAILED: 'failed',
    RETRY: 'retry'
  },
  
  PAYMENT_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded',
    CANCELLED: 'cancelled'
  },
  
  ORDER_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PROCESSING: 'processing',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    RETURNED: 'returned'
  },
  
  FRIEND_REQUEST_STATUS: {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired'
  },
  
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  },
  
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    DEFAULT_SKIP: 0
  },
  
  SERVERS: {
    LOAD_BALANCER: 'BALANCER',
    SERVER_1: 'SERVER-1',
    SERVER_2: 'SERVER-2',
    SERVER_3: 'SERVER-3'
  },
  
  ENVIRONMENTS: {
    DEVELOPMENT: 'development',
    PRODUCTION: 'production',
    TEST: 'test'
  }
};