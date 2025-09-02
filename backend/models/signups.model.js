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

// Instance methods
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
    }
  };
};

const Signup = mongoose.model('Signup', signupSchema);

module.exports = Signup;