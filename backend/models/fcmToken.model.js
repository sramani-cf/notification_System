const mongoose = require('mongoose');

const fcmTokenSchema = new mongoose.Schema({
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
  token: {
    type: String,
    required: [true, 'FCM token is required'],
    unique: true,
    index: true
  },
  deviceInfo: {
    platform: {
      type: String,
      enum: ['web', 'android', 'ios'],
      default: 'web'
    },
    browser: {
      type: String,
      default: null
    },
    browserVersion: {
      type: String,
      default: null
    },
    os: {
      type: String,
      default: null
    },
    osVersion: {
      type: String,
      default: null
    },
    deviceModel: {
      type: String,
      default: null
    },
    appVersion: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isStale: {
    type: Boolean,
    default: false,
    index: true
  },
  lastActivityAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  tokenRefreshCount: {
    type: Number,
    default: 0
  },
  lastRefreshedAt: {
    type: Date,
    default: null
  },
  registrationSource: {
    type: String,
    enum: ['web_app', 'mobile_app', 'api', 'import'],
    default: 'web_app'
  },
  permissions: {
    notifications: {
      type: Boolean,
      default: true
    },
    purchase: {
      type: Boolean,
      default: true
    },
    friendRequest: {
      type: Boolean,
      default: true
    },
    login: {
      type: Boolean,
      default: true
    },
    marketing: {
      type: Boolean,
      default: false
    }
  },
  notificationStats: {
    sent: {
      type: Number,
      default: 0
    },
    delivered: {
      type: Number,
      default: 0
    },
    clicked: {
      type: Number,
      default: 0
    },
    failed: {
      type: Number,
      default: 0
    },
    lastSentAt: {
      type: Date,
      default: null
    },
    lastDeliveredAt: {
      type: Date,
      default: null
    },
    lastClickedAt: {
      type: Date,
      default: null
    },
    lastFailedAt: {
      type: Date,
      default: null
    }
  },
  fcmErrors: [{
    error: String,
    errorCode: String,
    timestamp: Date,
    resolved: {
      type: Boolean,
      default: false
    }
  }],
  metadata: {
    ipAddress: String,
    location: {
      country: String,
      region: String,
      city: String,
      timezone: String
    },
    sessionId: String,
    registeredBy: String
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from creation
    },
    index: true
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'fcmtokens'
});

// Compound indexes for better query performance
fcmTokenSchema.index({ userId: 1, isActive: 1, isStale: -1 });
fcmTokenSchema.index({ token: 1, isActive: 1 });
fcmTokenSchema.index({ lastActivityAt: 1, isStale: 1 });
fcmTokenSchema.index({ expiresAt: 1 });
fcmTokenSchema.index({ 'deviceInfo.platform': 1, isActive: 1 });

// Pre-save middleware
fcmTokenSchema.pre('save', function(next) {
  // Check for staleness (30 days of inactivity)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (this.lastActivityAt < thirtyDaysAgo) {
    this.isStale = true;
    this.isActive = false;
  }
  
  // Update expiration date on activity
  if (this.isModified('lastActivityAt')) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    this.isStale = false;
    this.isActive = true;
  }
  
  next();
});

// Instance methods
fcmTokenSchema.methods.updateActivity = function() {
  this.lastActivityAt = new Date();
  this.isStale = false;
  this.isActive = true;
  this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return this.save();
};

fcmTokenSchema.methods.markAsStale = function() {
  this.isStale = true;
  this.isActive = false;
  return this.save();
};

fcmTokenSchema.methods.refreshToken = function(newToken) {
  this.token = newToken;
  this.tokenRefreshCount += 1;
  this.lastRefreshedAt = new Date();
  this.lastActivityAt = new Date();
  this.isStale = false;
  this.isActive = true;
  this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return this.save();
};

fcmTokenSchema.methods.updateNotificationStats = function(status) {
  const now = new Date();
  
  switch (status) {
    case 'sent':
      this.notificationStats.sent += 1;
      this.notificationStats.lastSentAt = now;
      break;
    case 'delivered':
      this.notificationStats.delivered += 1;
      this.notificationStats.lastDeliveredAt = now;
      break;
    case 'clicked':
      this.notificationStats.clicked += 1;
      this.notificationStats.lastClickedAt = now;
      this.lastActivityAt = now; // User interaction updates activity
      break;
    case 'failed':
      this.notificationStats.failed += 1;
      this.notificationStats.lastFailedAt = now;
      break;
  }
  
  return this.save();
};

fcmTokenSchema.methods.addError = function(error, errorCode) {
  this.fcmErrors = this.fcmErrors || [];
  this.fcmErrors.push({
    error: error,
    errorCode: errorCode,
    timestamp: new Date(),
    resolved: false
  });
  
  // Mark as inactive if critical errors
  const criticalErrors = ['InvalidRegistration', 'NotRegistered', 'MismatchSenderId'];
  if (criticalErrors.includes(errorCode)) {
    this.isActive = false;
  }
  
  return this.save();
};

fcmTokenSchema.methods.resolveErrors = function() {
  this.fcmErrors = this.fcmErrors.map(err => ({
    ...err,
    resolved: true
  }));
  this.isActive = true;
  return this.save();
};

fcmTokenSchema.methods.updatePermissions = function(permissions) {
  Object.assign(this.permissions, permissions);
  return this.save();
};

fcmTokenSchema.methods.checkStaleness = function() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return this.lastActivityAt < thirtyDaysAgo;
};

fcmTokenSchema.methods.isValid = function() {
  return this.isActive && !this.isStale && new Date() < this.expiresAt;
};

// Static methods
fcmTokenSchema.statics.findActiveTokensForUser = function(userId) {
  return this.find({
    userId: userId,
    isActive: true,
    isStale: false,
    expiresAt: { $gt: new Date() }
  });
};

fcmTokenSchema.statics.findByToken = function(token) {
  return this.findOne({ token: token });
};

fcmTokenSchema.statics.markStaleTokens = async function() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const result = await this.updateMany(
    {
      lastActivityAt: { $lt: thirtyDaysAgo },
      isStale: false
    },
    {
      $set: {
        isStale: true,
        isActive: false
      }
    }
  );
  
  return result;
};

fcmTokenSchema.statics.cleanupExpiredTokens = async function() {
  const now = new Date();
  
  const result = await this.deleteMany({
    expiresAt: { $lt: now }
  });
  
  return result;
};

fcmTokenSchema.statics.getTokenStatistics = async function() {
  const [totalStats, platformStats, activityStats] = await Promise.all([
    // Total statistics
    this.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          },
          stale: {
            $sum: { $cond: [{ $eq: ['$isStale', true] }, 1, 0] }
          }
        }
      }
    ]),
    // Platform distribution
    this.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$deviceInfo.platform',
          count: { $sum: 1 }
        }
      }
    ]),
    // Activity statistics
    this.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          avgNotificationsSent: { $avg: '$notificationStats.sent' },
          avgNotificationsDelivered: { $avg: '$notificationStats.delivered' },
          avgNotificationsClicked: { $avg: '$notificationStats.clicked' },
          totalSent: { $sum: '$notificationStats.sent' },
          totalDelivered: { $sum: '$notificationStats.delivered' },
          totalClicked: { $sum: '$notificationStats.clicked' },
          totalFailed: { $sum: '$notificationStats.failed' }
        }
      }
    ])
  ]);
  
  const total = totalStats[0] || { total: 0, active: 0, stale: 0 };
  const activity = activityStats[0] || {};
  
  return {
    tokens: {
      total: total.total,
      active: total.active,
      stale: total.stale,
      activeRate: total.total > 0 ? 
        (total.active / total.total * 100).toFixed(2) + '%' : '0%'
    },
    platforms: platformStats.reduce((acc, stat) => ({ 
      ...acc, 
      [stat._id || 'unknown']: stat.count 
    }), {}),
    activity: {
      avgSent: activity.avgNotificationsSent?.toFixed(2) || 0,
      avgDelivered: activity.avgNotificationsDelivered?.toFixed(2) || 0,
      avgClicked: activity.avgNotificationsClicked?.toFixed(2) || 0,
      totalSent: activity.totalSent || 0,
      totalDelivered: activity.totalDelivered || 0,
      totalClicked: activity.totalClicked || 0,
      totalFailed: activity.totalFailed || 0,
      clickRate: activity.totalDelivered > 0 ? 
        (activity.totalClicked / activity.totalDelivered * 100).toFixed(2) + '%' : '0%'
    }
  };
};

fcmTokenSchema.statics.getBulkTokens = function(userIds) {
  return this.find({
    userId: { $in: userIds },
    isActive: true,
    isStale: false,
    expiresAt: { $gt: new Date() }
  }).select('userId token deviceInfo.platform');
};

fcmTokenSchema.statics.validateTokenFormat = function(token) {
  // FCM token format validation (typically 152+ characters)
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Basic FCM token pattern check
  const fcmTokenPattern = /^[a-zA-Z0-9:_-]{100,}$/;
  return fcmTokenPattern.test(token);
};

fcmTokenSchema.statics.updateBulkActivity = async function(tokenIds) {
  const now = new Date();
  const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  const result = await this.updateMany(
    { _id: { $in: tokenIds } },
    {
      $set: {
        lastActivityAt: now,
        isStale: false,
        isActive: true,
        expiresAt: futureExpiry
      }
    }
  );
  
  return result;
};

const FcmToken = mongoose.model('FcmToken', fcmTokenSchema);

module.exports = FcmToken;