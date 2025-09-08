const mongoose = require('mongoose');

const pushNotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['signup', 'login', 'reset_password', 'purchase', 'friend_request'],
    required: [true, 'Notification type is required'],
    index: true
  },
  recipient: {
    userId: {
      type: Number,
      required: [true, 'User ID is required'],
      index: true
    },
    username: {
      type: String,
      required: false
    },
    email: {
      type: String,
      required: false
    },
    fcmTokens: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FcmToken'
    }]
  },
  title: {
    type: String,
    required: [true, 'Notification title is required']
  },
  body: {
    type: String,
    required: [true, 'Notification body is required']
  },
  data: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map()
  },
  imageUrl: {
    type: String,
    required: false
  },
  clickAction: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'delivered', 'failed', 'clicked'],
    default: 'pending',
    index: true
  },
  deliveryStatus: {
    sent: {
      type: Boolean,
      default: false
    },
    delivered: {
      type: Boolean,
      default: false
    },
    clicked: {
      type: Boolean,
      default: false
    },
    failed: {
      type: Boolean,
      default: false
    }
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
    index: true
  },
  timestamps: {
    sentAt: {
      type: Date,
      default: null
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    clickedAt: {
      type: Date,
      default: null
    },
    failedAt: {
      type: Date,
      default: null
    },
    lastAttemptAt: {
      type: Date,
      default: null
    }
  },
  failureReason: {
    type: String,
    default: null
  },
  fcmResponse: {
    messageId: String,
    multicastId: String,
    success: Number,
    failure: Number,
    canonicalIds: Number,
    results: [{
      messageId: String,
      registrationId: String,
      error: String
    }]
  },
  queueName: {
    type: String,
    enum: ['push', 'push-retry-1', 'push-retry-2', 'push-dlq'],
    default: 'push'
  },
  jobId: {
    type: String,
    required: false,
    index: true
  },
  metadata: {
    serverInfo: String,
    processedBy: String,
    originalData: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    retryHistory: [{
      attempt: Number,
      timestamp: Date,
      queue: String,
      error: String,
      fcmResponse: Object
    }],
    deviceInfo: {
      platform: String,
      browser: String,
      version: String
    },
    clickTracking: {
      url: String,
      timestamp: Date,
      userAgent: String
    }
  },
  assignedServer: {
    type: String,
    required: false
  },
  // Source tracking - what triggered this notification
  source: {
    type: {
      type: String,
      enum: ['purchase', 'manual', 'api', 'system', 'test'],
      default: 'api'
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'source.referenceModel',
      default: null
    },
    referenceModel: {
      type: String,
      enum: ['Purchase', 'User', null],
      default: null
    },
    triggerDetails: {
      endpoint: String,
      userAgent: String,
      ipAddress: String,
      timestamp: Date
    }
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from creation
    },
    index: true
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'pushnotifications'
});

// Compound indexes for better query performance
pushNotificationSchema.index({ status: 1, type: 1, createdAt: -1 });
pushNotificationSchema.index({ 'recipient.userId': 1, status: 1, createdAt: -1 });
pushNotificationSchema.index({ status: 1, attempts: 1 });
pushNotificationSchema.index({ queueName: 1, status: 1 });
pushNotificationSchema.index({ 'deliveryStatus.sent': 1, 'deliveryStatus.delivered': 1 });
pushNotificationSchema.index({ priority: 1, status: 1, createdAt: 1 });

// Pre-save middleware
pushNotificationSchema.pre('save', function(next) {
  if (this.isNew) {
    this.metadata = this.metadata || {};
    this.metadata.retryHistory = this.metadata.retryHistory || [];
  }
  
  // Update status timestamps
  if (this.isModified('status')) {
    const now = new Date();
    switch (this.status) {
      case 'sent':
        this.timestamps.sentAt = this.timestamps.sentAt || now;
        this.deliveryStatus.sent = true;
        break;
      case 'delivered':
        this.timestamps.deliveredAt = this.timestamps.deliveredAt || now;
        this.deliveryStatus.delivered = true;
        break;
      case 'clicked':
        this.timestamps.clickedAt = this.timestamps.clickedAt || now;
        this.deliveryStatus.clicked = true;
        break;
      case 'failed':
        this.timestamps.failedAt = this.timestamps.failedAt || now;
        this.deliveryStatus.failed = true;
        break;
      case 'processing':
        this.timestamps.lastAttemptAt = now;
        break;
    }
  }
  
  next();
});

// Instance methods
pushNotificationSchema.methods.markAsSent = function(fcmResponse) {
  this.status = 'sent';
  this.timestamps.sentAt = new Date();
  this.deliveryStatus.sent = true;
  if (fcmResponse) {
    this.fcmResponse = fcmResponse;
  }
  return this.save();
};

pushNotificationSchema.methods.markAsDelivered = function() {
  this.status = 'delivered';
  this.timestamps.deliveredAt = new Date();
  this.deliveryStatus.delivered = true;
  return this.save();
};

pushNotificationSchema.methods.markAsClicked = function(clickData) {
  this.status = 'clicked';
  this.timestamps.clickedAt = new Date();
  this.deliveryStatus.clicked = true;
  if (clickData) {
    this.metadata.clickTracking = {
      url: clickData.url,
      timestamp: new Date(),
      userAgent: clickData.userAgent
    };
  }
  return this.save();
};

pushNotificationSchema.methods.markAsFailed = function(reason, fcmResponse) {
  this.status = 'failed';
  this.timestamps.failedAt = new Date();
  this.deliveryStatus.failed = true;
  this.failureReason = reason;
  if (fcmResponse) {
    this.fcmResponse = fcmResponse;
  }
  return this.save();
};

pushNotificationSchema.methods.incrementAttempt = function(queue, error, fcmResponse) {
  this.attempts += 1;
  this.timestamps.lastAttemptAt = new Date();
  this.queueName = queue;
  
  // Add to retry history
  this.metadata.retryHistory = this.metadata.retryHistory || [];
  this.metadata.retryHistory.push({
    attempt: this.attempts,
    timestamp: new Date(),
    queue: queue,
    error: error || null,
    fcmResponse: fcmResponse || null
  });
  
  return this.save();
};

pushNotificationSchema.methods.canRetry = function() {
  return this.attempts < this.maxAttempts && 
         this.status !== 'delivered' && 
         this.status !== 'clicked' &&
         this.status !== 'failed' &&
         new Date() < this.expiresAt;
};

pushNotificationSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

pushNotificationSchema.methods.updateFcmTokens = function(tokenIds) {
  this.recipient.fcmTokens = tokenIds;
  return this.save();
};

// Static methods
pushNotificationSchema.statics.getStatistics = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [todayStats, totalStats, deliveryStats] = await Promise.all([
    // Today's statistics
    this.aggregate([
      { $match: { createdAt: { $gte: today } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]),
    // Total statistics
    this.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]),
    // Delivery rate calculation
    this.aggregate([
      {
        $match: {
          status: { $in: ['sent', 'delivered', 'clicked', 'failed'] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: {
            $sum: { $cond: [{ $eq: ['$deliveryStatus.sent', true] }, 1, 0] }
          },
          delivered: {
            $sum: { $cond: [{ $eq: ['$deliveryStatus.delivered', true] }, 1, 0] }
          },
          clicked: {
            $sum: { $cond: [{ $eq: ['$deliveryStatus.clicked', true] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$deliveryStatus.failed', true] }, 1, 0] }
          }
        }
      }
    ])
  ]);
  
  const stats = deliveryStats[0] || { total: 0, sent: 0, delivered: 0, clicked: 0, failed: 0 };
  
  return {
    today: todayStats.reduce((acc, stat) => ({ ...acc, [stat._id]: stat.count }), {}),
    total: totalStats.reduce((acc, stat) => ({ ...acc, [stat._id]: stat.count }), {}),
    deliveryRate: stats.total > 0 ? 
      (stats.delivered / stats.total * 100).toFixed(2) + '%' : '0%',
    clickRate: stats.delivered > 0 ? 
      (stats.clicked / stats.delivered * 100).toFixed(2) + '%' : '0%',
    failureRate: stats.total > 0 ? 
      (stats.failed / stats.total * 100).toFixed(2) + '%' : '0%',
    metrics: {
      sent: stats.sent,
      delivered: stats.delivered,
      clicked: stats.clicked,
      failed: stats.failed
    }
  };
};

pushNotificationSchema.statics.getPendingNotifications = function() {
  return this.find({
    status: { $in: ['pending', 'processing'] },
    attempts: { $lt: 3 },
    expiresAt: { $gt: new Date() }
  }).sort({ priority: -1, createdAt: 1 });
};

pushNotificationSchema.statics.getFailedNotifications = function() {
  return this.find({
    status: 'failed'
  }).sort({ createdAt: -1 });
};

pushNotificationSchema.statics.getUserNotificationHistory = function(userId, options = {}) {
  const { 
    limit = 50, 
    skip = 0, 
    type = null,
    status = null,
    sort = '-createdAt' 
  } = options;
  
  const query = {
    'recipient.userId': userId
  };
  
  if (type) {
    query.type = type;
  }
  
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .limit(parseInt(limit))
    .skip(parseInt(skip))
    .sort(sort)
    .populate('recipient.fcmTokens', 'token platform');
};

pushNotificationSchema.statics.cleanupExpiredNotifications = async function() {
  const now = new Date();
  
  const result = await this.deleteMany({
    expiresAt: { $lt: now },
    status: { $in: ['delivered', 'clicked', 'failed'] }
  });
  
  return result;
};

pushNotificationSchema.statics.getDeliveryMetrics = async function(startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          type: '$type'
        },
        total: { $sum: 1 },
        sent: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus.sent', true] }, 1, 0] }
        },
        delivered: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus.delivered', true] }, 1, 0] }
        },
        clicked: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus.clicked', true] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$deliveryStatus.failed', true] }, 1, 0] }
        }
      }
    },
    {
      $sort: { '_id.date': 1, '_id.type': 1 }
    }
  ]);
};

const PushNotification = mongoose.model('PushNotification', pushNotificationSchema);

module.exports = PushNotification;