const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Item name is required']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price must be positive']
  },
  sku: {
    type: String,
    default: null
  },
  category: {
    type: String,
    default: null
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  }
}, { _id: false });

const purchaseSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: [true, 'User ID is required'],
    index: true
  },
  orderId: {
    type: String,
    required: [true, 'Order ID is required'],
    unique: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    uppercase: true,
    default: 'USD'
  },
  items: {
    type: [purchaseItemSchema],
    required: [true, 'Items are required'],
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: 'At least one item is required'
    }
  },
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'debit_card', 'paypal', 'bank_transfer', 'cash', 'crypto'],
    default: 'credit_card'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
    index: true
  },
  transactionId: {
    type: String,
    default: null,
    index: true
  },
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  billingAddress: {
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  shippingMethod: {
    type: String,
    enum: ['standard', 'express', 'overnight', 'pickup'],
    default: 'standard'
  },
  trackingNumber: {
    type: String,
    default: null
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending',
    index: true
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: [0, 'Tax amount cannot be negative']
  },
  shippingCost: {
    type: Number,
    default: 0,
    min: [0, 'Shipping cost cannot be negative']
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount must be positive']
  },
  discountCode: {
    type: String,
    default: null
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: [0, 'Discount amount cannot be negative']
  },
  notes: {
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
  },
  // Push notification delivery tracking fields (mirrors login email schema structure)
  purchasePushNotification: {
    status: {
      type: String,
      enum: ['pending', 'queued', 'sending', 'delivered', 'failed', 'clicked', 'not_sent'],
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
    clickedAt: {
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
      ref: 'PushNotification',
      default: null,
      index: true
    },
    queueJobId: {
      type: String,
      default: null
    },
    fcmResponse: {
      successCount: {
        type: Number,
        default: 0
      },
      failureCount: {
        type: Number,
        default: 0
      },
      messageIds: [String],
      errors: [String]
    },
    fcmTokenCount: {
      type: Number,
      default: 0
    },
    deliveryHistory: [{
      attempt: Number,
      timestamp: Date,
      status: String,
      error: String,
      queueName: String,
      fcmTokenCount: Number,
      successCount: Number,
      failureCount: Number
    }]
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'purchases'
});

// Indexes
purchaseSchema.index({ createdAt: -1 });
purchaseSchema.index({ userId: 1, createdAt: -1 });
purchaseSchema.index({ paymentStatus: 1, createdAt: -1 });
purchaseSchema.index({ orderStatus: 1, createdAt: -1 });

// Pre-save middleware
purchaseSchema.pre('save', function(next) {
  if (this.isNew) {
    // Calculate total amount if not provided
    if (!this.totalAmount || this.totalAmount === 0) {
      const itemsTotal = this.items.reduce((sum, item) => {
        return sum + (item.price * item.quantity - (item.discount || 0));
      }, 0);
      
      this.totalAmount = itemsTotal + this.shippingCost + this.taxAmount - this.discountAmount;
    }
    
    // Generate transaction ID for completed payments
    if (!this.transactionId && this.paymentStatus === 'completed') {
      this.transactionId = 'TXN_' + new mongoose.Types.ObjectId().toString();
    }
    
    this.metadata = this.metadata || new Map();
    this.metadata.set('createdTimestamp', Date.now());
  }
  
  next();
});

// Instance methods
purchaseSchema.methods.calculateTotal = function() {
  const itemsTotal = this.items.reduce((sum, item) => {
    return sum + (item.price * item.quantity - (item.discount || 0));
  }, 0);
  
  return itemsTotal + this.shippingCost + this.taxAmount - this.discountAmount;
};

purchaseSchema.methods.toJSON = function() {
  const obj = this.toObject();
  if (obj.metadata instanceof Map) {
    obj.metadata = Object.fromEntries(obj.metadata);
  }
  return obj;
};

// Instance methods for push notification delivery tracking (mirrors login email methods)
purchaseSchema.methods.updatePurchasePushNotificationStatus = function(status, details = {}) {
  this.purchasePushNotification = this.purchasePushNotification || {};
  this.purchasePushNotification.status = status;
  
  // Add to delivery history
  this.purchasePushNotification.deliveryHistory = this.purchasePushNotification.deliveryHistory || [];
  this.purchasePushNotification.deliveryHistory.push({
    attempt: this.purchasePushNotification.attempts + 1,
    timestamp: new Date(),
    status: status,
    error: details.error || null,
    queueName: details.queueName || 'push',
    fcmTokenCount: details.fcmTokenCount || 0,
    successCount: details.successCount || 0,
    failureCount: details.failureCount || 0
  });
  
  // Update specific fields based on status
  switch (status) {
    case 'queued':
      this.purchasePushNotification.queueJobId = details.jobId;
      this.purchasePushNotification.notificationId = details.notificationId;
      break;
    case 'sending':
      this.purchasePushNotification.attempts += 1;
      this.purchasePushNotification.lastAttemptAt = new Date();
      this.purchasePushNotification.fcmTokenCount = details.fcmTokenCount || 0;
      break;
    case 'delivered':
      this.purchasePushNotification.deliveredAt = new Date();
      this.purchasePushNotification.messageId = details.messageId;
      if (details.fcmResponse) {
        this.purchasePushNotification.fcmResponse = {
          successCount: details.fcmResponse.successCount || 0,
          failureCount: details.fcmResponse.failureCount || 0,
          messageIds: details.fcmResponse.messageIds || [],
          errors: details.fcmResponse.errors || []
        };
      }
      break;
    case 'failed':
      this.purchasePushNotification.failedAt = new Date();
      this.purchasePushNotification.failureReason = details.error || 'Unknown error';
      this.purchasePushNotification.attempts += 1;
      this.purchasePushNotification.lastAttemptAt = new Date();
      if (details.fcmResponse) {
        this.purchasePushNotification.fcmResponse = {
          successCount: details.fcmResponse.successCount || 0,
          failureCount: details.fcmResponse.failureCount || 0,
          messageIds: details.fcmResponse.messageIds || [],
          errors: details.fcmResponse.errors || []
        };
      }
      break;
    case 'clicked':
      this.purchasePushNotification.clickedAt = new Date();
      break;
  }
  
  return this.save();
};

purchaseSchema.methods.markPurchasePushNotificationQueued = function(jobId, notificationId) {
  return this.updatePurchasePushNotificationStatus('queued', { jobId, notificationId });
};

purchaseSchema.methods.markPurchasePushNotificationSending = function(fcmTokenCount, queueName = 'push') {
  return this.updatePurchasePushNotificationStatus('sending', { fcmTokenCount, queueName });
};

purchaseSchema.methods.markPurchasePushNotificationDelivered = function(messageId, fcmResponse) {
  return this.updatePurchasePushNotificationStatus('delivered', { messageId, fcmResponse });
};

purchaseSchema.methods.markPurchasePushNotificationFailed = function(error, fcmResponse, queueName = 'push') {
  return this.updatePurchasePushNotificationStatus('failed', { error, fcmResponse, queueName });
};

purchaseSchema.methods.markPurchasePushNotificationClicked = function() {
  return this.updatePurchasePushNotificationStatus('clicked');
};

purchaseSchema.methods.getPurchasePushNotificationSummary = function() {
  return {
    status: this.purchasePushNotification?.status || 'not_sent',
    attempts: this.purchasePushNotification?.attempts || 0,
    lastAttemptAt: this.purchasePushNotification?.lastAttemptAt,
    deliveredAt: this.purchasePushNotification?.deliveredAt,
    failedAt: this.purchasePushNotification?.failedAt,
    clickedAt: this.purchasePushNotification?.clickedAt,
    messageId: this.purchasePushNotification?.messageId,
    failureReason: this.purchasePushNotification?.failureReason,
    fcmTokenCount: this.purchasePushNotification?.fcmTokenCount || 0,
    fcmResponse: this.purchasePushNotification?.fcmResponse,
    totalHistoryEntries: this.purchasePushNotification?.deliveryHistory?.length || 0
  };
};

// Static methods
purchaseSchema.statics.getOrdersByStatus = function(status, limit = 100) {
  return this.find({ orderStatus: status })
    .sort({ createdAt: -1 })
    .limit(limit);
};

purchaseSchema.statics.getUserPurchaseHistory = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

purchaseSchema.statics.getPurchaseStatistics = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);
  
  const [todayOrders, todayRevenue, monthOrders, monthRevenue] = await Promise.all([
    this.countDocuments({ createdAt: { $gte: today } }),
    this.aggregate([
      { $match: { createdAt: { $gte: today }, paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    this.countDocuments({ createdAt: { $gte: thisMonth } }),
    this.aggregate([
      { $match: { createdAt: { $gte: thisMonth }, paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ])
  ]);
  
  const categoryStats = await this.aggregate([
    { $unwind: '$items' },
    { $group: {
      _id: '$items.category',
      count: { $sum: 1 },
      revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
    }},
    { $sort: { revenue: -1 } },
    { $limit: 10 }
  ]);
  
  const paymentMethodStats = await this.aggregate([
    { $group: {
      _id: '$paymentMethod',
      count: { $sum: 1 },
      revenue: { $sum: '$totalAmount' }
    }},
    { $sort: { count: -1 } }
  ]);
  
  return {
    today: {
      orders: todayOrders,
      revenue: todayRevenue[0]?.total || 0
    },
    thisMonth: {
      orders: monthOrders,
      revenue: monthRevenue[0]?.total || 0
    },
    topCategories: categoryStats,
    paymentMethods: paymentMethodStats
  };
};

const Purchase = mongoose.model('Purchase', purchaseSchema);

module.exports = Purchase;