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
    topSenders
  };
};

const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);

module.exports = FriendRequest;