const Purchase = require('../models/purchases.model');
const logger = require('../utils/logger');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES } = require('../constants');

class PurchaseController {
  async create(req, res, next) {
    try {
      logger.info(`Received POST /api/purchases with order: ${req.body.orderId}`, req.serverInfo);
      
      const purchaseData = {
        ...req.body,
        assignedServer: req.serverInfo,
        processedBy: `${req.serverInfo}-${Date.now()}`
      };
      
      const existingOrder = await Purchase.findOne({ orderId: purchaseData.orderId });
      if (existingOrder) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Order with this ID already exists'
        });
      }
      
      const purchase = new Purchase(purchaseData);
      await purchase.save();
      
      logger.success(`Created purchase order: ${purchase._id} (Order ID: ${purchase.orderId})`, req.serverInfo);
      
      // Trigger push notification for purchase
      try {
        const notificationData = {
          userId: purchase.userId,
          username: purchase.customerName || `User ${purchase.userId}`,
          email: purchase.customerEmail,
          orderId: purchase.orderId,
          totalAmount: purchase.totalAmount,
          currency: purchase.currency || 'USD',
          items: purchase.items,
          paymentMethod: purchase.paymentMethod,
          purchaseId: purchase._id.toString()
        };

        const notificationResult = await notificationService.sendNotification(
          NOTIFICATION_TYPES.PURCHASE,
          notificationData,
          {
            serverInfo: req.serverInfo,
            sourceType: 'purchase',
            sourceId: purchase._id,
            sourceModel: 'Purchase',
            endpoint: req.originalUrl,
            userAgent: req.headers['user-agent'],
            ipAddress: req.ip
          }
        );

        logger.info(`Purchase notification sent: ${JSON.stringify(notificationResult)}`, req.serverInfo);
        
        // Update purchase with push notification tracking using new methods
        if (notificationResult.push && notificationResult.push.notificationId) {
          await purchase.markPurchasePushNotificationQueued(
            notificationResult.push.jobId,
            notificationResult.push.notificationId
          );
          logger.info(`Marked purchase ${purchase._id} push notification as queued with ID ${notificationResult.push.notificationId}`, req.serverInfo);
        }
      } catch (notificationError) {
        // Don't fail the purchase if notification fails
        logger.error(`Failed to send purchase notification: ${notificationError.message}`, req.serverInfo);
        
        // Track notification failure using new method
        await purchase.markPurchasePushNotificationFailed(
          notificationError.message,
          null,
          'push'
        );
        logger.error(`Marked purchase ${purchase._id} push notification as failed: ${notificationError.message}`, req.serverInfo);
      }
      
      res.status(201).json({
        success: true,
        server: req.serverInfo,
        data: purchase,
        message: 'Purchase order created successfully'
      });
    } catch (error) {
      logger.error(`Error creating purchase: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getAll(req, res, next) {
    try {
      const { 
        userId,
        paymentStatus, 
        orderStatus, 
        paymentMethod,
        limit = 20, 
        skip = 0, 
        sort = '-createdAt' 
      } = req.query;
      
      const query = {};
      
      if (userId) {
        query.userId = parseInt(userId);
      }
      
      if (paymentStatus) {
        query.paymentStatus = paymentStatus;
      }
      
      if (orderStatus) {
        query.orderStatus = orderStatus;
      }
      
      if (paymentMethod) {
        query.paymentMethod = paymentMethod;
      }
      
      const purchases = await Purchase.find(query)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort(sort);
      
      const total = await Purchase.countDocuments(query);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: purchases,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching purchases: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getById(req, res, next) {
    try {
      const purchase = await Purchase.findById(req.params.id);
      
      if (!purchase) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Purchase order not found'
        });
      }
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: purchase
      });
    } catch (error) {
      logger.error(`Error fetching purchase: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getByOrderId(req, res, next) {
    try {
      const { orderId } = req.params;
      const purchase = await Purchase.findOne({ orderId });
      
      if (!purchase) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Purchase order not found'
        });
      }
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: purchase
      });
    } catch (error) {
      logger.error(`Error fetching purchase by order ID: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getUserPurchases(req, res, next) {
    try {
      const { userId } = req.params;
      const { limit = 50 } = req.query;
      
      const purchases = await Purchase.getUserPurchaseHistory(
        parseInt(userId), 
        parseInt(limit)
      );
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: purchases,
        count: purchases.length,
        userId: parseInt(userId)
      });
    } catch (error) {
      logger.error(`Error fetching user purchases: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async updateOrderStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { orderStatus, trackingNumber, notes } = req.body;
      
      const updateData = {};
      if (orderStatus) updateData.orderStatus = orderStatus;
      if (trackingNumber) updateData.trackingNumber = trackingNumber;
      if (notes) updateData.notes = notes;
      
      
      const purchase = await Purchase.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );
      
      if (!purchase) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Purchase order not found'
        });
      }
      
      logger.info(`Updated order status for purchase: ${id} to ${orderStatus}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: purchase,
        message: 'Order status updated successfully'
      });
    } catch (error) {
      logger.error(`Error updating order status: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async updatePaymentStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { paymentStatus, transactionId } = req.body;
      
      const updateData = { paymentStatus };
      
      if (transactionId) {
        updateData.transactionId = transactionId;
      }
      
      if (paymentStatus === 'completed' && !updateData.transactionId) {
        updateData.transactionId = 'TXN_' + Date.now();
      }
      
      const purchase = await Purchase.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );
      
      if (!purchase) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Purchase order not found'
        });
      }
      
      logger.info(`Updated payment status for purchase: ${id} to ${paymentStatus}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: purchase,
        message: 'Payment status updated successfully'
      });
    } catch (error) {
      logger.error(`Error updating payment status: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async processRefund(req, res, next) {
    try {
      const { id } = req.params;
      const { refundAmount, refundReason } = req.body;
      
      const purchase = await Purchase.findById(id);
      
      if (!purchase) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Purchase order not found'
        });
      }
      
      if (purchase.paymentStatus !== 'completed') {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Cannot refund an incomplete payment'
        });
      }
      
      purchase.paymentStatus = 'refunded';
      purchase.orderStatus = 'cancelled';
      purchase.metadata = purchase.metadata || new Map();
      purchase.metadata.set('refundAmount', refundAmount || purchase.totalAmount);
      purchase.metadata.set('refundReason', refundReason || 'Customer request');
      purchase.metadata.set('refundedAt', new Date());
      
      await purchase.save();
      
      logger.info(`Processed refund for purchase: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: purchase,
        message: 'Refund processed successfully',
        refund: {
          amount: refundAmount || purchase.totalAmount,
          reason: refundReason || 'Customer request'
        }
      });
    } catch (error) {
      logger.error(`Error processing refund: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  
  
  async getOrdersByStatus(req, res, next) {
    try {
      const { status } = req.params;
      const { limit = 100 } = req.query;
      
      const orders = await Purchase.getOrdersByStatus(status, parseInt(limit));
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: orders,
        count: orders.length,
        status
      });
    } catch (error) {
      logger.error(`Error fetching orders by status: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getStatistics(req, res, next) {
    try {
      const stats = await Purchase.getPurchaseStatistics();
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: stats
      });
    } catch (error) {
      logger.error(`Error fetching purchase statistics: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async updateShipping(req, res, next) {
    try {
      const { id } = req.params;
      const { shippingAddress, shippingMethod, shippingCost } = req.body;
      
      const updateData = {};
      if (shippingAddress) updateData.shippingAddress = shippingAddress;
      if (shippingMethod) updateData.shippingMethod = shippingMethod;
      if (shippingCost !== undefined) updateData.shippingCost = shippingCost;
      
      const purchase = await Purchase.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );
      
      if (!purchase) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Purchase order not found'
        });
      }
      
      const newTotal = purchase.calculateTotal();
      if (newTotal !== purchase.totalAmount) {
        purchase.totalAmount = newTotal;
        await purchase.save();
      }
      
      logger.info(`Updated shipping info for purchase: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: purchase,
        message: 'Shipping information updated successfully'
      });
    } catch (error) {
      logger.error(`Error updating shipping: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async applyDiscount(req, res, next) {
    try {
      const { id } = req.params;
      const { discountCode, discountAmount } = req.body;
      
      const purchase = await Purchase.findById(id);
      
      if (!purchase) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Purchase order not found'
        });
      }
      
      if (purchase.paymentStatus === 'completed') {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Cannot apply discount to completed purchase'
        });
      }
      
      purchase.discountCode = discountCode;
      purchase.discountAmount = discountAmount;
      purchase.totalAmount = purchase.calculateTotal();
      
      await purchase.save();
      
      logger.info(`Applied discount to purchase: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: purchase,
        message: 'Discount applied successfully',
        discount: {
          code: discountCode,
          amount: discountAmount,
          newTotal: purchase.totalAmount
        }
      });
    } catch (error) {
      logger.error(`Error applying discount: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async deleteOrder(req, res, next) {
    try {
      const { id } = req.params;
      
      const purchase = await Purchase.findById(id);
      
      if (!purchase) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Purchase order not found'
        });
      }
      
      if (purchase.paymentStatus === 'completed' && purchase.orderStatus !== 'cancelled') {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Cannot delete completed order. Please cancel or refund first.'
        });
      }
      
      await Purchase.findByIdAndDelete(id);
      
      logger.success(`Deleted purchase order: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        message: 'Purchase order deleted successfully'
      });
    } catch (error) {
      logger.error(`Error deleting order: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
}

module.exports = new PurchaseController();