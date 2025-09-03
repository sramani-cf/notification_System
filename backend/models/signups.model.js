const mongoose = require('mongoose');

const signupSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: [true, 'User ID is required'],
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true,
    minLength: [3, 'Username must be at least 3 characters'],
    maxLength: [50, 'Username cannot exceed 50 characters'],
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    unique: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    index: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minLength: [6, 'Password must be at least 6 characters']
  },
  verificationToken: {
    type: String,
    default: null
  },
  emailVerified: {
    type: Boolean,
    default: false,
    index: true
  },
  accountCreated: {
    type: Boolean,
    default: false
  },
  registrationIp: {
    type: String,
    default: null
  },
  registrationDevice: {
    type: String,
    default: null
  },
  assignedServer: {
    type: String,
    required: false
  },
  processedBy: {
    type: String,
    required: false
  },
  // Email delivery tracking fields
  welcomeEmail: {
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
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'signups'
});

// Indexes for better query performance
signupSchema.index({ createdAt: -1 });
signupSchema.index({ emailVerified: 1, createdAt: -1 });
signupSchema.index({ username: 1, email: 1 });

// Pre-save middleware
signupSchema.pre('save', function(next) {
  if (this.isNew && !this.verificationToken) {
    this.verificationToken = new mongoose.Types.ObjectId().toString();
  }
  
  if (this.isNew) {
    this.metadata = this.metadata || new Map();
    this.metadata.set('createdTimestamp', Date.now());
  }
  
  next();
});

// Instance methods for email delivery tracking
signupSchema.methods.updateWelcomeEmailStatus = function(status, details = {}) {
  this.welcomeEmail = this.welcomeEmail || {};
  this.welcomeEmail.status = status;
  
  // Add to delivery history
  this.welcomeEmail.deliveryHistory = this.welcomeEmail.deliveryHistory || [];
  this.welcomeEmail.deliveryHistory.push({
    attempt: this.welcomeEmail.attempts + 1,
    timestamp: new Date(),
    status: status,
    error: details.error || null,
    queueName: details.queueName || 'mail'
  });
  
  // Update specific fields based on status
  switch (status) {
    case 'queued':
      this.welcomeEmail.queueJobId = details.jobId;
      this.welcomeEmail.notificationId = details.notificationId;
      break;
    case 'sending':
      this.welcomeEmail.attempts += 1;
      this.welcomeEmail.lastAttemptAt = new Date();
      break;
    case 'delivered':
      this.welcomeEmail.deliveredAt = new Date();
      this.welcomeEmail.messageId = details.messageId;
      this.welcomeEmail.smtpResponse = details.smtpResponse;
      break;
    case 'failed':
      this.welcomeEmail.failedAt = new Date();
      this.welcomeEmail.failureReason = details.error || 'Unknown error';
      this.welcomeEmail.attempts += 1;
      this.welcomeEmail.lastAttemptAt = new Date();
      break;
  }
  
  return this.save();
};

signupSchema.methods.markWelcomeEmailQueued = function(jobId, notificationId) {
  return this.updateWelcomeEmailStatus('queued', { jobId, notificationId });
};

signupSchema.methods.markWelcomeEmailSending = function(queueName = 'mail') {
  return this.updateWelcomeEmailStatus('sending', { queueName });
};

signupSchema.methods.markWelcomeEmailDelivered = function(messageId, smtpResponse) {
  return this.updateWelcomeEmailStatus('delivered', { messageId, smtpResponse });
};

signupSchema.methods.markWelcomeEmailFailed = function(error, queueName = 'mail') {
  return this.updateWelcomeEmailStatus('failed', { error, queueName });
};

signupSchema.methods.getWelcomeEmailSummary = function() {
  return {
    status: this.welcomeEmail?.status || 'not_sent',
    attempts: this.welcomeEmail?.attempts || 0,
    lastAttemptAt: this.welcomeEmail?.lastAttemptAt,
    deliveredAt: this.welcomeEmail?.deliveredAt,
    failedAt: this.welcomeEmail?.failedAt,
    messageId: this.welcomeEmail?.messageId,
    failureReason: this.welcomeEmail?.failureReason,
    totalHistoryEntries: this.welcomeEmail?.deliveryHistory?.length || 0
  };
};

signupSchema.methods.toJSON = function() {
  const obj = this.toObject();
  if (obj.metadata instanceof Map) {
    obj.metadata = Object.fromEntries(obj.metadata);
  }
  delete obj.password; // Never send password in JSON response
  return obj;
};

// Static methods
signupSchema.statics.findUnverifiedAccounts = function(daysOld = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return this.find({
    emailVerified: false,
    createdAt: { $lt: cutoffDate }
  });
};

signupSchema.statics.getSignupStatistics = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const thisWeek = new Date();
  thisWeek.setDate(thisWeek.getDate() - 7);
  
  const thisMonth = new Date();
  thisMonth.setDate(thisMonth.getDate() - 30);
  
  const [todayCount, weekCount, monthCount, totalCount] = await Promise.all([
    this.countDocuments({ createdAt: { $gte: today } }),
    this.countDocuments({ createdAt: { $gte: thisWeek } }),
    this.countDocuments({ createdAt: { $gte: thisMonth } }),
    this.countDocuments()
  ]);
  
  const verificationStats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        verified: {
          $sum: { $cond: [{ $eq: ['$emailVerified', true] }, 1, 0] }
        },
        unverified: {
          $sum: { $cond: [{ $eq: ['$emailVerified', false] }, 1, 0] }
        },
      }
    }
  ]);

  // Email delivery statistics
  const emailStats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        delivered: {
          $sum: { $cond: [{ $eq: ['$welcomeEmail.status', 'delivered'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$welcomeEmail.status', 'failed'] }, 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$welcomeEmail.status', 'pending'] }, 1, 0] }
        },
        queued: {
          $sum: { $cond: [{ $eq: ['$welcomeEmail.status', 'queued'] }, 1, 0] }
        },
        sending: {
          $sum: { $cond: [{ $eq: ['$welcomeEmail.status', 'sending'] }, 1, 0] }
        },
        not_sent: {
          $sum: { $cond: [{ $eq: ['$welcomeEmail.status', 'not_sent'] }, 1, 0] }
        }
      }
    }
  ]);
  
  return {
    signups: {
      today: todayCount,
      thisWeek: weekCount,
      thisMonth: monthCount,
      total: totalCount
    },
    verification: verificationStats[0] || {
      total: 0,
      verified: 0,
      unverified: 0
    },
    welcomeEmails: emailStats[0] || {
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

// Get signups with failed welcome emails
signupSchema.statics.getFailedWelcomeEmails = function() {
  return this.find({
    'welcomeEmail.status': 'failed'
  }).sort({ 'welcomeEmail.failedAt': -1 });
};

// Get signups with pending welcome emails
signupSchema.statics.getPendingWelcomeEmails = function() {
  return this.find({
    'welcomeEmail.status': { $in: ['pending', 'queued', 'sending'] }
  }).sort({ createdAt: -1 });
};

const Signup = mongoose.model('Signup', signupSchema);

module.exports = Signup;