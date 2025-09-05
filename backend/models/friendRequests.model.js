const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
  fromUserId: {
    type: Number,
    required: [true, 'From User ID is required'],
    index: true
  },
  fromUsername: {
    type: String,
    required: [true, 'From Username is required']
  },
  toUserId: {
    type: Number,
    required: [true, 'To User ID is required'],
    index: true
  },
  toUsername: {
    type: String,
    required: [true, 'To Username is required']
  },
  message: {
    type: String,
    default: null,
    maxLength: [500, 'Message cannot exceed 500 characters']
  },
  requestStatus: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled', 'blocked'],
    default: 'pending',
    index: true
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  mutualFriends: [{
    userId: Number,
    username: String
  }],
  mutualFriendsCount: {
    type: Number,
    default: 0
  },
  relationshipType: {
    type: String,
    enum: ['friend', 'close_friend', 'family', 'colleague', 'acquaintance'],
    default: 'friend'
  },
  previousInteractions: {
    type: Number,
    default: 0
  },
  blockedByReceiver: {
    type: Boolean,
    default: false
  },
  reportedAsSpam: {
    type: Boolean,
    default: false
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'mutual_only'],
    default: 'public'
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    },
    index: true
  },
  assignedServer: {
    type: String,
    required: false
  },
  processedBy: {
    type: String,
    required: false
  },
  // In-app notification delivery tracking fields (mirrors login schema structure)
  friendRequestInAppNotification: {
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
  collection: 'friendrequests'
});

// Compound indexes for better query performance
friendRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
friendRequestSchema.index({ toUserId: 1, requestStatus: 1, createdAt: -1 });
friendRequestSchema.index({ fromUserId: 1, requestStatus: 1, createdAt: -1 });
friendRequestSchema.index({ requestStatus: 1, expiresAt: 1 });

// Pre-save middleware
friendRequestSchema.pre('save', function(next) {
  if (this.isNew) {
    // Calculate mutual friends count
    if (this.mutualFriends && this.mutualFriends.length > 0) {
      this.mutualFriendsCount = this.mutualFriends.length;
    }
    
    this.metadata = this.metadata || new Map();
    this.metadata.set('createdTimestamp', Date.now());
  }
  
  // Update status timestamps
  if (this.isModified('requestStatus')) {
    switch (this.requestStatus) {
      case 'accepted':
        this.acceptedAt = this.acceptedAt || new Date();
        break;
      case 'rejected':
        this.rejectedAt = this.rejectedAt || new Date();
        break;
      case 'cancelled':
        this.cancelledAt = this.cancelledAt || new Date();
        break;
    }
  }
  
  next();
});

// Instance methods
friendRequestSchema.methods.accept = function() {
  this.requestStatus = 'accepted';
  this.acceptedAt = new Date();
  return this.save();
};

friendRequestSchema.methods.reject = function() {
  this.requestStatus = 'rejected';
  this.rejectedAt = new Date();
  return this.save();
};

friendRequestSchema.methods.cancel = function() {
  this.requestStatus = 'cancelled';
  this.cancelledAt = new Date();
  return this.save();
};

friendRequestSchema.methods.block = function() {
  this.requestStatus = 'blocked';
  this.blockedByReceiver = true;
  return this.save();
};


// Instance methods for friend request in-app notification delivery tracking (mirrors login methods)
friendRequestSchema.methods.updateFriendRequestInAppNotificationStatus = function(status, details = {}) {
  this.friendRequestInAppNotification = this.friendRequestInAppNotification || {};
  this.friendRequestInAppNotification.status = status;
  
  // Add to delivery history
  this.friendRequestInAppNotification.deliveryHistory = this.friendRequestInAppNotification.deliveryHistory || [];
  this.friendRequestInAppNotification.deliveryHistory.push({
    attempt: this.friendRequestInAppNotification.attempts + 1,
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
      this.friendRequestInAppNotification.queueJobId = details.jobId;
      this.friendRequestInAppNotification.notificationId = details.notificationId;
      break;
    case 'delivered':
      this.friendRequestInAppNotification.deliveredAt = new Date();
      this.friendRequestInAppNotification.socketId = details.socketId;
      this.friendRequestInAppNotification.deliveredVia = details.deliveryMethod || 'websocket';
      break;
    case 'failed':
      this.friendRequestInAppNotification.failedAt = new Date();
      this.friendRequestInAppNotification.failureReason = details.error || 'Unknown error';
      this.friendRequestInAppNotification.attempts += 1;
      this.friendRequestInAppNotification.lastAttemptAt = new Date();
      break;
    case 'pending':
      this.friendRequestInAppNotification.attempts += 1;
      this.friendRequestInAppNotification.lastAttemptAt = new Date();
      break;
  }
  
  return this.save();
};

friendRequestSchema.methods.markFriendRequestInAppNotificationQueued = function(jobId, notificationId) {
  return this.updateFriendRequestInAppNotificationStatus('queued', { jobId, notificationId });
};

friendRequestSchema.methods.markFriendRequestInAppNotificationDelivered = function(socketId, deliveryMethod = 'websocket') {
  return this.updateFriendRequestInAppNotificationStatus('delivered', { socketId, deliveryMethod });
};

friendRequestSchema.methods.markFriendRequestInAppNotificationFailed = function(error, queueName = 'inapp', socketId = null) {
  return this.updateFriendRequestInAppNotificationStatus('failed', { error, queueName, socketId });
};

friendRequestSchema.methods.getFriendRequestInAppNotificationSummary = function() {
  return {
    status: this.friendRequestInAppNotification?.status || 'not_sent',
    attempts: this.friendRequestInAppNotification?.attempts || 0,
    lastAttemptAt: this.friendRequestInAppNotification?.lastAttemptAt,
    deliveredAt: this.friendRequestInAppNotification?.deliveredAt,
    failedAt: this.friendRequestInAppNotification?.failedAt,
    socketId: this.friendRequestInAppNotification?.socketId,
    deliveredVia: this.friendRequestInAppNotification?.deliveredVia,
    failureReason: this.friendRequestInAppNotification?.failureReason,
    totalHistoryEntries: this.friendRequestInAppNotification?.deliveryHistory?.length || 0
  };
};

friendRequestSchema.methods.toJSON = function() {
  const obj = this.toObject();
  if (obj.metadata instanceof Map) {
    obj.metadata = Object.fromEntries(obj.metadata);
  }
  return obj;
};

// Static methods
friendRequestSchema.statics.getPendingRequests = function(userId) {
  return this.find({
    toUserId: userId,
    requestStatus: 'pending',
    expiresAt: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

friendRequestSchema.statics.getSentRequests = function(userId) {
  return this.find({
    fromUserId: userId
  }).sort({ createdAt: -1 });
};

friendRequestSchema.statics.checkExistingRequest = function(fromUserId, toUserId) {
  return this.findOne({
    $or: [
      { fromUserId, toUserId },
      { fromUserId: toUserId, toUserId: fromUserId }
    ],
    requestStatus: { $in: ['pending', 'accepted'] }
  });
};

friendRequestSchema.statics.getFriends = function(userId) {
  return this.find({
    $or: [
      { fromUserId: userId, requestStatus: 'accepted' },
      { toUserId: userId, requestStatus: 'accepted' }
    ]
  });
};

friendRequestSchema.statics.cleanupExpiredRequests = async function() {
  const result = await this.updateMany(
    {
      requestStatus: 'pending',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { requestStatus: 'cancelled', cancelledAt: new Date() }
    }
  );
  return result;
};

friendRequestSchema.statics.getFriendRequestStatistics = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [todayRequests, pendingTotal, acceptedTotal, rejectedTotal] = await Promise.all([
    this.countDocuments({ createdAt: { $gte: today } }),
    this.countDocuments({ requestStatus: 'pending' }),
    this.countDocuments({ requestStatus: 'accepted' }),
    this.countDocuments({ requestStatus: 'rejected' })
  ]);
  
  const acceptanceRate = await this.aggregate([
    {
      $match: {
        requestStatus: { $in: ['accepted', 'rejected'] }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ['$requestStatus', 'accepted'] }, 1, 0] }
        }
      }
    }
  ]);
  
  const topSenders = await this.aggregate([
    {
      $group: {
        _id: '$fromUserId',
        username: { $first: '$fromUsername' },
        count: { $sum: 1 },
        accepted: {
          $sum: { $cond: [{ $eq: ['$requestStatus', 'accepted'] }, 1, 0] }
        }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  
  // Friend request in-app notification statistics
  const notificationStats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ['$friendRequestInAppNotification.status', 'delivered'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$friendRequestInAppNotification.status', 'failed'] }, 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$friendRequestInAppNotification.status', 'pending'] }, 1, 0] }
        },
        queued: {
          $sum: { $cond: [{ $eq: ['$friendRequestInAppNotification.status', 'queued'] }, 1, 0] }
        },
        not_sent: {
          $sum: { $cond: [{ $eq: ['$friendRequestInAppNotification.status', 'not_sent'] }, 1, 0] }
        }
      }
    }
  ]);

  return {
    today: todayRequests,
    status: {
      pending: pendingTotal,
      accepted: acceptedTotal,
      rejected: rejectedTotal
    },
    acceptanceRate: acceptanceRate[0] ? 
      (acceptanceRate[0].accepted / acceptanceRate[0].total * 100).toFixed(2) + '%' : 
      '0%',
    topSenders,
    friendRequestInAppNotifications: notificationStats[0] || {
      total: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
      queued: 0,
      not_sent: 0
    }
  };
};

// Static methods for friend request in-app notification management (mirrors login methods)
friendRequestSchema.statics.getFailedFriendRequestInAppNotifications = function() {
  return this.find({
    'friendRequestInAppNotification.status': 'failed'
  }).sort({ 'friendRequestInAppNotification.failedAt': -1 });
};

friendRequestSchema.statics.getPendingFriendRequestInAppNotifications = function() {
  return this.find({
    'friendRequestInAppNotification.status': { $in: ['pending', 'queued'] }
  }).sort({ createdAt: -1 });
};

const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);

module.exports = FriendRequest;