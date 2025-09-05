const mongoose = require('mongoose');

const inAppNotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['signup', 'login', 'reset_password', 'purchase', 'friend_request'],
    required: [true, 'Notification type is required'],
    index: true
  },
  recipient: {
    userId: {
      type: Number,
      required: [true, 'Recipient userId is required'],
      index: true
    },
    username: {
      type: String,
      required: false
    },
    email: {
      type: String,
      required: false,
      index: true
    }
  },
  title: {
    type: String,
    required: [true, 'Notification title is required']
  },
  message: {
    type: String,
    required: [true, 'Notification message is required']
  },
  data: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  status: {
    type: String,
    enum: ['pending', 'queued', 'delivered', 'failed', 'expired'],
    default: 'pending',
    index: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  lastAttemptAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  failedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from creation
    }
  },
  failureReason: {
    type: String,
    default: null
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  queueName: {
    type: String,
    enum: ['inapp', 'inapp-retry-1', 'inapp-retry-2', 'inapp-dlq'],
    default: 'inapp'
  },
  jobId: {
    type: String,
    required: false,
    index: true
  },
  socketId: {
    type: String,
    default: null
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  metadata: {
    serverInfo: String,
    processedBy: String,
    originalData: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    deliveryHistory: [{
      attempt: Number,
      timestamp: Date,
      status: String,
      error: String,
      socketId: String,
      deliveryMethod: String,
      queueName: String
    }],
    escalationHistory: [{
      fromQueue: String,
      toQueue: String,
      timestamp: Date,
      reason: String,
      attempts: Number
    }]
  },
  assignedServer: {
    type: String,
    required: false
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'inappnotifications'
});

// Compound indexes for better query performance
inAppNotificationSchema.index({ status: 1, type: 1, createdAt: -1 });
inAppNotificationSchema.index({ 'recipient.userId': 1, status: 1, createdAt: -1 });
inAppNotificationSchema.index({ 'recipient.userId': 1, isRead: 1, createdAt: -1 });
inAppNotificationSchema.index({ status: 1, attempts: 1 });
inAppNotificationSchema.index({ queueName: 1, status: 1 });
inAppNotificationSchema.index({ expiresAt: 1 }); // For cleanup of expired notifications

// Pre-save middleware
inAppNotificationSchema.pre('save', function(next) {
  if (this.isNew) {
    this.metadata = this.metadata || {};
    this.metadata.deliveryHistory = this.metadata.deliveryHistory || [];
    this.metadata.escalationHistory = this.metadata.escalationHistory || [];
  }
  
  // Update status timestamps
  if (this.isModified('status')) {
    switch (this.status) {
      case 'delivered':
        this.deliveredAt = this.deliveredAt || new Date();
        break;
      case 'failed':
        this.failedAt = this.failedAt || new Date();
        break;
      case 'queued':
        this.lastAttemptAt = new Date();
        break;
    }
  }
  
  // Mark as read when delivered (for login notifications)
  if (this.status === 'delivered' && this.type === 'login') {
    this.isRead = true;
    this.readAt = new Date();
  }
  
  next();
});

// Instance methods
inAppNotificationSchema.methods.markAsDelivered = function(socketId, deliveryMethod = 'websocket') {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  this.socketId = socketId;
  
  // Add to delivery history
  this.metadata.deliveryHistory = this.metadata.deliveryHistory || [];
  this.metadata.deliveryHistory.push({
    attempt: this.attempts + 1,
    timestamp: new Date(),
    status: 'delivered',
    socketId: socketId,
    deliveryMethod: deliveryMethod,
    queueName: this.queueName
  });
  
  return this.save();
};

inAppNotificationSchema.methods.markAsFailed = function(reason, socketId = null) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.failureReason = reason;
  
  // Add to delivery history
  this.metadata.deliveryHistory = this.metadata.deliveryHistory || [];
  this.metadata.deliveryHistory.push({
    attempt: this.attempts + 1,
    timestamp: new Date(),
    status: 'failed',
    error: reason,
    socketId: socketId || null,
    deliveryMethod: 'websocket',
    queueName: this.queueName
  });
  
  return this.save();
};

inAppNotificationSchema.methods.incrementAttempt = function(queueName, error = null) {
  this.attempts += 1;
  this.lastAttemptAt = new Date();
  this.queueName = queueName;
  
  // Add to delivery history
  this.metadata.deliveryHistory = this.metadata.deliveryHistory || [];
  this.metadata.deliveryHistory.push({
    attempt: this.attempts,
    timestamp: new Date(),
    status: 'processing',
    error: error || null,
    deliveryMethod: 'websocket',
    queueName: this.queueName
  });
  
  return this.save();
};

inAppNotificationSchema.methods.canRetry = function() {
  return this.attempts < this.maxAttempts && 
         this.status !== 'delivered' && 
         this.status !== 'failed' && 
         new Date() < this.expiresAt;
};

inAppNotificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

inAppNotificationSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

inAppNotificationSchema.methods.trackEscalation = function(fromQueue, toQueue, reason) {
  this.metadata.escalationHistory = this.metadata.escalationHistory || [];
  this.metadata.escalationHistory.push({
    fromQueue: fromQueue,
    toQueue: toQueue,
    timestamp: new Date(),
    reason: reason,
    attempts: this.attempts
  });
  
  return this.save();
};

// Static methods
inAppNotificationSchema.statics.getStatistics = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [todayStats, totalStats] = await Promise.all([
    this.aggregate([
      { $match: { createdAt: { $gte: today } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]),
    this.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ])
  ]);
  
  const deliveryRate = await this.aggregate([
    {
      $match: {
        status: { $in: ['delivered', 'failed'] }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
        }
      }
    }
  ]);
  
  const readRate = await this.aggregate([
    {
      $match: {
        status: 'delivered'
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        read: {
          $sum: { $cond: [{ $eq: ['$isRead', true] }, 1, 0] }
        }
      }
    }
  ]);
  
  return {
    today: todayStats.reduce((acc, stat) => ({ ...acc, [stat._id]: stat.count }), {}),
    total: totalStats.reduce((acc, stat) => ({ ...acc, [stat._id]: stat.count }), {}),
    deliveryRate: deliveryRate[0] ? 
      (deliveryRate[0].delivered / deliveryRate[0].total * 100).toFixed(2) + '%' : 
      '0%',
    readRate: readRate[0] ? 
      (readRate[0].read / readRate[0].total * 100).toFixed(2) + '%' : 
      '0%'
  };
};

inAppNotificationSchema.statics.getPendingNotifications = function() {
  return this.find({
    status: { $in: ['pending', 'queued'] },
    attempts: { $lt: 3 },
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: 1 });
};

inAppNotificationSchema.statics.getFailedNotifications = function() {
  return this.find({
    status: 'failed'
  }).sort({ createdAt: -1 });
};

inAppNotificationSchema.statics.getUserNotifications = function(userId, options = {}) {
  const { 
    limit = 50, 
    skip = 0, 
    onlyUnread = false, 
    type = null,
    sort = '-createdAt' 
  } = options;
  
  const query = {
    'recipient.userId': userId,
    status: 'delivered',
    expiresAt: { $gt: new Date() }
  };
  
  if (onlyUnread) {
    query.isRead = false;
  }
  
  if (type) {
    query.type = type;
  }
  
  return this.find(query)
    .limit(parseInt(limit))
    .skip(parseInt(skip))
    .sort(sort)
    .select('-metadata -data');
};

inAppNotificationSchema.statics.markUserNotificationsAsRead = async function(userId, notificationIds = null) {
  const query = {
    'recipient.userId': userId,
    isRead: false,
    status: 'delivered'
  };
  
  if (notificationIds && notificationIds.length > 0) {
    query._id = { $in: notificationIds };
  }
  
  const result = await this.updateMany(query, {
    $set: {
      isRead: true,
      readAt: new Date()
    }
  });
  
  return result;
};

inAppNotificationSchema.statics.cleanupExpiredNotifications = async function() {
  const now = new Date();
  
  const result = await this.deleteMany({
    expiresAt: { $lt: now },
    status: { $in: ['delivered', 'failed', 'expired'] }
  });
  
  return result;
};

inAppNotificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({
    'recipient.userId': userId,
    isRead: false,
    status: 'delivered',
    expiresAt: { $gt: new Date() }
  });
};

const InAppNotification = mongoose.model('InAppNotification', inAppNotificationSchema);

module.exports = InAppNotification;