const mongoose = require('mongoose');

const emailNotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['signup', 'login', 'reset_password'],
    required: [true, 'Notification type is required'],
    index: true
  },
  recipient: {
    email: {
      type: String,
      required: [true, 'Recipient email is required'],
      index: true
    },
    userId: {
      type: Number,
      required: false,
      index: true
    },
    username: {
      type: String,
      required: false
    }
  },
  subject: {
    type: String,
    required: [true, 'Email subject is required']
  },
  content: {
    html: {
      type: String,
      required: [true, 'Email HTML content is required']
    },
    text: {
      type: String,
      required: false
    }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'delivered', 'failed'],
    default: 'pending',
    index: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 4
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
  queueName: {
    type: String,
    enum: ['mail', 'retry-1', 'retry-2', 'dlq'],
    default: 'mail'
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
      error: String
    }]
  },
  assignedServer: {
    type: String,
    required: false
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'emailnotifications'
});

// Compound indexes for better query performance
emailNotificationSchema.index({ status: 1, type: 1, createdAt: -1 });
emailNotificationSchema.index({ 'recipient.email': 1, type: 1, createdAt: -1 });
emailNotificationSchema.index({ status: 1, attempts: 1 });
emailNotificationSchema.index({ queueName: 1, status: 1 });

// Pre-save middleware
emailNotificationSchema.pre('save', function(next) {
  if (this.isNew) {
    this.metadata = this.metadata || {};
    this.metadata.retryHistory = this.metadata.retryHistory || [];
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
      case 'processing':
        this.lastAttemptAt = new Date();
        break;
    }
  }
  
  next();
});

// Instance methods
emailNotificationSchema.methods.markAsDelivered = function() {
  this.status = 'delivered';
  this.deliveredAt = new Date();
  return this.save();
};

emailNotificationSchema.methods.markAsFailed = function(reason) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.failureReason = reason;
  return this.save();
};

emailNotificationSchema.methods.incrementAttempt = function(queue, error) {
  this.attempts += 1;
  this.lastAttemptAt = new Date();
  this.queueName = queue;
  
  // Add to retry history
  this.metadata.retryHistory = this.metadata.retryHistory || [];
  this.metadata.retryHistory.push({
    attempt: this.attempts,
    timestamp: new Date(),
    queue: queue,
    error: error || null
  });
  
  return this.save();
};

emailNotificationSchema.methods.canRetry = function() {
  return this.attempts < this.maxAttempts && this.status !== 'delivered' && this.status !== 'failed';
};

// Static methods
emailNotificationSchema.statics.getStatistics = async function() {
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
  
  return {
    today: todayStats.reduce((acc, stat) => ({ ...acc, [stat._id]: stat.count }), {}),
    total: totalStats.reduce((acc, stat) => ({ ...acc, [stat._id]: stat.count }), {}),
    deliveryRate: deliveryRate[0] ? 
      (deliveryRate[0].delivered / deliveryRate[0].total * 100).toFixed(2) + '%' : 
      '0%'
  };
};

emailNotificationSchema.statics.getPendingNotifications = function() {
  return this.find({
    status: { $in: ['pending', 'processing'] },
    attempts: { $lt: 4 }
  }).sort({ createdAt: 1 });
};

emailNotificationSchema.statics.getFailedNotifications = function() {
  return this.find({
    status: 'failed'
  }).sort({ createdAt: -1 });
};

emailNotificationSchema.statics.cleanupOldNotifications = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await this.deleteMany({
    createdAt: { $lt: cutoffDate },
    status: { $in: ['delivered', 'failed'] }
  });
  
  return result;
};

const EmailNotification = mongoose.model('EmailNotification', emailNotificationSchema);

module.exports = EmailNotification;