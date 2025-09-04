const mongoose = require('mongoose');

const loginSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: [true, 'User ID is required'],
    index: true
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required']
  },
  ipAddress: {
    type: String,
    required: [true, 'IP address is required']
  },
  device: {
    type: String,
    required: [true, 'Device information is required']
  },
  userAgent: {
    type: String,
    default: null
  },
  location: {
    country: {
      type: String,
      default: null
    },
    city: {
      type: String,
      default: null
    },
    region: {
      type: String,
      default: null
    }
  },
  loginSuccessful: {
    type: Boolean,
    default: false,
    index: true
  },
  failureReason: {
    type: String,
    default: null
  },
  sessionToken: {
    type: String,
    default: null,
    index: true
  },
  sessionExpiresAt: {
    type: Date,
    default: null
  },
  isSuspicious: {
    type: Boolean,
    default: false,
    index: true
  },
  suspiciousReasons: [{
    type: String,
    enum: ['unknown_location', 'multiple_failed_attempts', 'unusual_time', 'new_device', 'private_ip_address']
  }],
  twoFactorRequired: {
    type: Boolean,
    default: false
  },
  twoFactorCompleted: {
    type: Boolean,
    default: false
  },
  assignedServer: {
    type: String,
    required: false
  },
  processedBy: {
    type: String,
    required: false
  },
  // Email delivery tracking fields (mirrors signup schema structure)
  loginAlertEmail: {
    status: {
      type: String,
      enum: ['pending', 'queued', 'sending', 'delivered', 'failed', 'not_sent'],
      default: 'not_sent',
      index: true
    },
    attempts: {
      type: Number,
      default: 0
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
    failureReason: {
      type: String,
      default: null
    },
    messageId: {
      type: String,
      default: null
    },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailNotification',
      default: null,
      index: true
    },
    queueJobId: {
      type: String,
      default: null
    },
    smtpResponse: {
      type: String,
      default: null
    },
    deliveryHistory: [{
      attempt: Number,
      timestamp: Date,
      status: String,
      error: String,
      queueName: String
    }]
  },
  // In-app notification delivery tracking fields (mirrors email tracking structure)
  loginInAppNotification: {
    status: {
      type: String,
      enum: ['pending', 'queued', 'delivered', 'failed', 'not_sent'],
      default: 'not_sent',
      index: true
    },
    attempts: {
      type: Number,
      default: 0
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
    failureReason: {
      type: String,
      default: null
    },
    notificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InAppNotification',
      default: null,
      index: true
    },
    queueJobId: {
      type: String,
      default: null
    },
    socketId: {
      type: String,
      default: null
    },
    deliveredVia: {
      type: String,
      enum: ['websocket', 'polling', 'fallback'],
      default: null
    },
    deliveryHistory: [{
      attempt: Number,
      timestamp: Date,
      status: String,
      error: String,
      queueName: String,
      socketId: String,
      deliveryMethod: String
    }]
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'logins'
});

// Indexes
loginSchema.index({ createdAt: -1 });
loginSchema.index({ userId: 1, createdAt: -1 });
loginSchema.index({ loginSuccessful: 1, createdAt: -1 });
loginSchema.index({ isSuspicious: 1, createdAt: -1 });

// Pre-save middleware
loginSchema.pre('save', function(next) {
  if (this.isNew) {
    this.checkSuspiciousActivity();
    this.metadata = this.metadata || new Map();
    this.metadata.set('createdTimestamp', Date.now());
  }
  
  if (this.loginSuccessful && !this.sessionToken) {
    this.sessionToken = new mongoose.Types.ObjectId().toString();
    const expirationHours = 24;
    this.sessionExpiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
  }
  
  next();
});

// Instance methods
loginSchema.methods.checkSuspiciousActivity = function() {
  const suspiciousReasons = [];
  
  if ((this.ipAddress && this.ipAddress.startsWith('10.')) || 
      (this.ipAddress && this.ipAddress.startsWith('172.')) ||
      (this.ipAddress && this.ipAddress.startsWith('192.168.'))) {
    suspiciousReasons.push('private_ip_address');
  }
  
  const hour = new Date().getHours();
  if (hour >= 2 && hour <= 5) {
    suspiciousReasons.push('unusual_time');
  }
  
  if (suspiciousReasons.length > 0) {
    this.isSuspicious = true;
    this.suspiciousReasons = suspiciousReasons;
  }
};

// Instance methods for login alert email delivery tracking (mirrors signup methods)
loginSchema.methods.updateLoginAlertEmailStatus = function(status, details = {}) {
  this.loginAlertEmail = this.loginAlertEmail || {};
  this.loginAlertEmail.status = status;
  
  // Add to delivery history
  this.loginAlertEmail.deliveryHistory = this.loginAlertEmail.deliveryHistory || [];
  this.loginAlertEmail.deliveryHistory.push({
    attempt: this.loginAlertEmail.attempts + 1,
    timestamp: new Date(),
    status: status,
    error: details.error || null,
    queueName: details.queueName || 'mail'
  });
  
  // Update specific fields based on status
  switch (status) {
    case 'queued':
      this.loginAlertEmail.queueJobId = details.jobId;
      this.loginAlertEmail.notificationId = details.notificationId;
      break;
    case 'sending':
      this.loginAlertEmail.attempts += 1;
      this.loginAlertEmail.lastAttemptAt = new Date();
      break;
    case 'delivered':
      this.loginAlertEmail.deliveredAt = new Date();
      this.loginAlertEmail.messageId = details.messageId;
      this.loginAlertEmail.smtpResponse = details.smtpResponse;
      break;
    case 'failed':
      this.loginAlertEmail.failedAt = new Date();
      this.loginAlertEmail.failureReason = details.error || 'Unknown error';
      this.loginAlertEmail.attempts += 1;
      this.loginAlertEmail.lastAttemptAt = new Date();
      break;
  }
  
  return this.save();
};

loginSchema.methods.markLoginAlertEmailQueued = function(jobId, notificationId) {
  return this.updateLoginAlertEmailStatus('queued', { jobId, notificationId });
};

loginSchema.methods.markLoginAlertEmailSending = function(queueName = 'mail') {
  return this.updateLoginAlertEmailStatus('sending', { queueName });
};

loginSchema.methods.markLoginAlertEmailDelivered = function(messageId, smtpResponse) {
  return this.updateLoginAlertEmailStatus('delivered', { messageId, smtpResponse });
};

loginSchema.methods.markLoginAlertEmailFailed = function(error, queueName = 'mail') {
  return this.updateLoginAlertEmailStatus('failed', { error, queueName });
};

loginSchema.methods.getLoginAlertEmailSummary = function() {
  return {
    status: this.loginAlertEmail?.status || 'not_sent',
    attempts: this.loginAlertEmail?.attempts || 0,
    lastAttemptAt: this.loginAlertEmail?.lastAttemptAt,
    deliveredAt: this.loginAlertEmail?.deliveredAt,
    failedAt: this.loginAlertEmail?.failedAt,
    messageId: this.loginAlertEmail?.messageId,
    failureReason: this.loginAlertEmail?.failureReason,
    totalHistoryEntries: this.loginAlertEmail?.deliveryHistory?.length || 0
  };
};

// Instance methods for login in-app notification delivery tracking
loginSchema.methods.updateLoginInAppNotificationStatus = function(status, details = {}) {
  this.loginInAppNotification = this.loginInAppNotification || {};
  this.loginInAppNotification.status = status;
  
  // Add to delivery history
  this.loginInAppNotification.deliveryHistory = this.loginInAppNotification.deliveryHistory || [];
  this.loginInAppNotification.deliveryHistory.push({
    attempt: this.loginInAppNotification.attempts + 1,
    timestamp: new Date(),
    status: status,
    error: details.error || null,
    queueName: details.queueName || 'inapp',
    socketId: details.socketId || null,
    deliveryMethod: details.deliveryMethod || 'websocket'
  });
  
  // Update specific fields based on status
  switch (status) {
    case 'queued':
      this.loginInAppNotification.queueJobId = details.jobId;
      this.loginInAppNotification.notificationId = details.notificationId;
      break;
    case 'delivered':
      this.loginInAppNotification.deliveredAt = new Date();
      this.loginInAppNotification.socketId = details.socketId;
      this.loginInAppNotification.deliveredVia = details.deliveryMethod || 'websocket';
      break;
    case 'failed':
      this.loginInAppNotification.failedAt = new Date();
      this.loginInAppNotification.failureReason = details.error || 'Unknown error';
      this.loginInAppNotification.attempts += 1;
      this.loginInAppNotification.lastAttemptAt = new Date();
      break;
    case 'pending':
      this.loginInAppNotification.attempts += 1;
      this.loginInAppNotification.lastAttemptAt = new Date();
      break;
  }
  
  return this.save();
};

loginSchema.methods.markLoginInAppNotificationQueued = function(jobId, notificationId) {
  return this.updateLoginInAppNotificationStatus('queued', { jobId, notificationId });
};

loginSchema.methods.markLoginInAppNotificationDelivered = function(socketId, deliveryMethod = 'websocket') {
  return this.updateLoginInAppNotificationStatus('delivered', { socketId, deliveryMethod });
};

loginSchema.methods.markLoginInAppNotificationFailed = function(error, queueName = 'inapp', socketId = null) {
  return this.updateLoginInAppNotificationStatus('failed', { error, queueName, socketId });
};

loginSchema.methods.getLoginInAppNotificationSummary = function() {
  return {
    status: this.loginInAppNotification?.status || 'not_sent',
    attempts: this.loginInAppNotification?.attempts || 0,
    lastAttemptAt: this.loginInAppNotification?.lastAttemptAt,
    deliveredAt: this.loginInAppNotification?.deliveredAt,
    failedAt: this.loginInAppNotification?.failedAt,
    socketId: this.loginInAppNotification?.socketId,
    deliveredVia: this.loginInAppNotification?.deliveredVia,
    failureReason: this.loginInAppNotification?.failureReason,
    totalHistoryEntries: this.loginInAppNotification?.deliveryHistory?.length || 0
  };
};

loginSchema.methods.toJSON = function() {
  const obj = this.toObject();
  if (obj.metadata instanceof Map) {
    obj.metadata = Object.fromEntries(obj.metadata);
  }
  delete obj.password; // Never send password in JSON response
  return obj;
};

// Static methods
loginSchema.statics.getFailedLogins = function(userId, hoursAgo = 24) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursAgo);
  
  return this.find({
    userId,
    loginSuccessful: false,
    createdAt: { $gte: cutoffDate }
  });
};

loginSchema.statics.getSuspiciousLogins = function(limit = 100) {
  return this.find({ isSuspicious: true })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static methods for login alert email management (mirrors signup methods)
loginSchema.statics.getFailedLoginAlertEmails = function() {
  return this.find({
    'loginAlertEmail.status': 'failed'
  }).sort({ 'loginAlertEmail.failedAt': -1 });
};

loginSchema.statics.getPendingLoginAlertEmails = function() {
  return this.find({
    'loginAlertEmail.status': { $in: ['pending', 'queued', 'sending'] }
  }).sort({ createdAt: -1 });
};

loginSchema.statics.getLoginStatistics = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [todayLogins, successfulToday, failedToday, suspiciousToday] = await Promise.all([
    this.countDocuments({ createdAt: { $gte: today } }),
    this.countDocuments({ createdAt: { $gte: today }, loginSuccessful: true }),
    this.countDocuments({ createdAt: { $gte: today }, loginSuccessful: false }),
    this.countDocuments({ createdAt: { $gte: today }, isSuspicious: true })
  ]);
  
  const deviceStats = await this.aggregate([
    {
      $group: {
        _id: '$device',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 10
    }
  ]);
  
  // Login alert email statistics
  const emailStats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ['$loginAlertEmail.status', 'delivered'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$loginAlertEmail.status', 'failed'] }, 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$loginAlertEmail.status', 'pending'] }, 1, 0] }
        },
        queued: {
          $sum: { $cond: [{ $eq: ['$loginAlertEmail.status', 'queued'] }, 1, 0] }
        },
        sending: {
          $sum: { $cond: [{ $eq: ['$loginAlertEmail.status', 'sending'] }, 1, 0] }
        },
        not_sent: {
          $sum: { $cond: [{ $eq: ['$loginAlertEmail.status', 'not_sent'] }, 1, 0] }
        }
      }
    }
  ]);
  
  return {
    today: {
      total: todayLogins,
      successful: successfulToday,
      failed: failedToday,
      suspicious: suspiciousToday
    },
    topDevices: deviceStats,
    loginAlertEmails: emailStats[0] || {
      total: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
      queued: 0,
      sending: 0,
      not_sent: 0
    }
  };
};

const Login = mongoose.model('Login', loginSchema);

module.exports = Login;