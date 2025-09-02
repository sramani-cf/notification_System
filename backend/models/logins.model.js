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
  
  return {
    today: {
      total: todayLogins,
      successful: successfulToday,
      failed: failedToday,
      suspicious: suspiciousToday
    },
    topDevices: deviceStats
  };
};

const Login = mongoose.model('Login', loginSchema);

module.exports = Login;