const mongoose = require('mongoose');

const resetPasswordSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: [true, 'User ID is required'],
    index: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    index: true
  },
  resetToken: {
    type: String,
    required: [true, 'Reset token is required'],
    unique: true,
    index: true
  },
  hashedToken: {
    type: String,
    required: [true, 'Hashed token is required']
  },
  expiresAt: {
    type: Date,
    required: [true, 'Token expiration is required'],
    index: true
  },
  requestedFrom: {
    ipAddress: {
      type: String,
      required: [true, 'IP address is required']
    },
    userAgent: {
      type: String,
      default: null
    },
    device: {
      type: String,
      default: null
    }
  },
  tokenUsed: {
    type: Boolean,
    default: false,
    index: true
  },
  usedAt: {
    type: Date,
    default: null
  },
  newPasswordSet: {
    type: Boolean,
    default: false
  },
  attemptCount: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 5
  },
  isExpired: {
    type: Boolean,
    default: false,
    index: true
  },
  invalidated: {
    type: Boolean,
    default: false
  },
  invalidatedReason: {
    type: String,
    default: null
  },
  securityQuestions: [{
    question: String,
    answeredCorrectly: Boolean,
    answeredAt: Date
  }],
  assignedServer: {
    type: String,
    required: false
  },
  processedBy: {
    type: String,
    required: false
  },
  emailNotification: {
    emailSent: {
      type: Boolean,
      default: false
    },
    emailSentAt: {
      type: Date,
      default: null
    },
    emailDeliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed'],
      default: 'pending'
    },
    emailMessageId: {
      type: String,
      default: null
    },
    emailFailureReason: {
      type: String,
      default: null
    },
    emailAttempts: {
      type: Number,
      default: 0
    },
    lastEmailAttemptAt: {
      type: Date,
      default: null
    }
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'resetpasswords'
});

// Indexes
resetPasswordSchema.index({ createdAt: -1 });
resetPasswordSchema.index({ tokenUsed: 1, expiresAt: 1 });
resetPasswordSchema.index({ userId: 1, createdAt: -1 });

// Pre-save middleware
resetPasswordSchema.pre('save', function(next) {
  if (this.isNew) {
    if (!this.expiresAt) {
      this.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    }
    
    this.metadata = this.metadata || new Map();
    this.metadata.set('createdTimestamp', Date.now());
  }
  
  if (this.tokenUsed && !this.usedAt) {
    this.usedAt = new Date();
  }
  
  if (new Date() > this.expiresAt) {
    this.isExpired = true;
  }
  
  next();
});

// Instance methods
resetPasswordSchema.methods.markAsUsed = function() {
  this.tokenUsed = true;
  this.usedAt = new Date();
  this.newPasswordSet = true;
  return this.save();
};

resetPasswordSchema.methods.invalidate = function(reason) {
  this.invalidated = true;
  this.invalidatedReason = reason;
  return this.save();
};

resetPasswordSchema.methods.incrementAttempt = function() {
  this.attemptCount++;
  if (this.attemptCount >= this.maxAttempts) {
    return this.invalidate('Max attempts exceeded');
  }
  return this.save();
};

resetPasswordSchema.methods.markEmailSent = function(messageId) {
  this.emailNotification = this.emailNotification || {};
  this.emailNotification.emailSent = true;
  this.emailNotification.emailSentAt = new Date();
  this.emailNotification.emailDeliveryStatus = 'sent';
  this.emailNotification.emailMessageId = messageId;
  this.emailNotification.emailAttempts = (this.emailNotification.emailAttempts || 0) + 1;
  this.emailNotification.lastEmailAttemptAt = new Date();
  return this.save();
};

resetPasswordSchema.methods.markEmailDelivered = function() {
  this.emailNotification = this.emailNotification || {};
  this.emailNotification.emailDeliveryStatus = 'delivered';
  return this.save();
};

resetPasswordSchema.methods.markEmailFailed = function(reason) {
  this.emailNotification = this.emailNotification || {};
  this.emailNotification.emailDeliveryStatus = 'failed';
  this.emailNotification.emailFailureReason = reason;
  this.emailNotification.emailAttempts = (this.emailNotification.emailAttempts || 0) + 1;
  this.emailNotification.lastEmailAttemptAt = new Date();
  return this.save();
};

resetPasswordSchema.methods.toJSON = function() {
  const obj = this.toObject();
  if (obj.metadata instanceof Map) {
    obj.metadata = Object.fromEntries(obj.metadata);
  }
  delete obj.hashedToken; // Never send hashed token in response
  return obj;
};

// Static methods
resetPasswordSchema.statics.findActiveTokens = function() {
  return this.find({
    tokenUsed: false,
    isExpired: false,
    invalidated: false,
    expiresAt: { $gt: new Date() }
  });
};

resetPasswordSchema.statics.cleanupExpiredTokens = async function() {
  const result = await this.updateMany(
    {
      expiresAt: { $lt: new Date() },
      isExpired: false
    },
    {
      $set: { isExpired: true }
    }
  );
  return result;
};

resetPasswordSchema.statics.getResetStatistics = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [todayRequests, usedToday, expiredToday, activeTokens] = await Promise.all([
    this.countDocuments({ createdAt: { $gte: today } }),
    this.countDocuments({ usedAt: { $gte: today } }),
    this.countDocuments({ createdAt: { $gte: today }, isExpired: true }),
    this.countDocuments({ tokenUsed: false, isExpired: false, invalidated: false })
  ]);
  
  const successRate = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        successful: {
          $sum: { $cond: [{ $eq: ['$newPasswordSet', true] }, 1, 0] }
        },
        expired: {
          $sum: { $cond: [{ $eq: ['$isExpired', true] }, 1, 0] }
        },
        invalidated: {
          $sum: { $cond: [{ $eq: ['$invalidated', true] }, 1, 0] }
        }
      }
    }
  ]);
  
  return {
    today: {
      requests: todayRequests,
      used: usedToday,
      expired: expiredToday,
      active: activeTokens
    },
    overall: successRate[0] || {
      total: 0,
      successful: 0,
      expired: 0,
      invalidated: 0
    }
  };
};

const ResetPassword = mongoose.model('ResetPassword', resetPasswordSchema);

module.exports = ResetPassword;