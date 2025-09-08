const pushNotificationService = require('../services/pushNotificationService');
const PushNotification = require('../models/pushNotification.model');
const logger = require('../utils/logger');

class PushNotificationController {
  /**
   * Get push notifications
   * GET /api/push-notifications
   */
  async getNotifications(req, res, next) {
    try {
      const {
        userId,
        type,
        status,
        limit = 50,
        skip = 0,
        sort = '-createdAt'
      } = req.query;

      const query = {};
      
      if (userId) {
        query['recipient.userId'] = parseInt(userId);
      }
      
      if (type) {
        query.type = type;
      }
      
      if (status) {
        query.status = status;
      }

      const notifications = await PushNotification.find(query)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort(sort)
        .populate('recipient.fcmTokens', 'token platform');

      const total = await PushNotification.countDocuments(query);

      res.json({
        success: true,
        data: notifications,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching push notifications: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get specific push notification
   * GET /api/push-notifications/:id
   */
  async getNotificationById(req, res, next) {
    try {
      const { id } = req.params;

      const notification = await PushNotification.findById(id)
        .populate('recipient.fcmTokens', 'token platform deviceInfo');

      if (!notification) {
        return res.status(404).json({
          success: false,
          error: 'Push notification not found'
        });
      }

      res.json({
        success: true,
        data: notification
      });
    } catch (error) {
      logger.error(`Error fetching push notification: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Send test push notification
   * POST /api/push-notifications/test
   */
  async sendTestNotification(req, res, next) {
    try {
      const { userId, token, title, body } = req.body;

      if (!userId && !token) {
        return res.status(400).json({
          success: false,
          error: 'Either userId or token is required'
        });
      }

      // If custom title and body provided, create a test notification
      if (title && body) {
        const testData = {
          userId: userId || 0,
          title,
          body,
          imageUrl: req.body.imageUrl,
          clickAction: req.body.clickAction || '/'
        };

        const result = await pushNotificationService.sendPushNotification(
          'test',
          testData,
          { serverInfo: req.serverInfo }
        );

        res.json({
          success: true,
          data: result,
          message: 'Custom test notification sent'
        });
      } else {
        // Send default test notification
        const result = await pushNotificationService.sendTestNotification(
          parseInt(userId),
          token
        );

        res.json({
          success: true,
          data: result,
          message: 'Test notification sent successfully'
        });
      }
    } catch (error) {
      logger.error(`Error sending test notification: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get push notification statistics
   * GET /api/push-notifications/statistics
   */
  async getStatistics(req, res, next) {
    try {
      const stats = await pushNotificationService.getStatistics();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error(`Error fetching push statistics: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Send batch push notifications
   * POST /api/push-notifications/batch
   */
  async sendBatchNotifications(req, res, next) {
    try {
      const { notifications } = req.body;

      if (!Array.isArray(notifications)) {
        return res.status(400).json({
          success: false,
          error: 'Notifications must be an array'
        });
      }

      const results = await pushNotificationService.sendBatchNotifications(notifications);

      logger.info(`Sent batch of ${results.successful} push notifications`, req.serverInfo);

      res.status(201).json({
        success: true,
        data: results,
        message: `Successfully sent ${results.successful} notifications, ${results.failed} failed`
      });
    } catch (error) {
      logger.error(`Error sending batch notifications: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get user notification history
   * GET /api/push-notifications/user/:userId
   */
  async getUserNotificationHistory(req, res, next) {
    try {
      const { userId } = req.params;
      const { limit, skip, type, status } = req.query;

      const notifications = await PushNotification.getUserNotificationHistory(
        parseInt(userId),
        { limit, skip, type, status }
      );

      res.json({
        success: true,
        data: notifications,
        count: notifications.length,
        userId: parseInt(userId)
      });
    } catch (error) {
      logger.error(`Error fetching user notification history: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get user notification statistics
   * GET /api/push-notifications/user/:userId/stats
   */
  async getUserNotificationStats(req, res, next) {
    try {
      const { userId } = req.params;

      const stats = await PushNotification.aggregate([
        { $match: { 'recipient.userId': parseInt(userId) } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            sent: {
              $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
            },
            delivered: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            clicked: {
              $sum: { $cond: [{ $eq: ['$status', 'clicked'] }, 1, 0] }
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            }
          }
        }
      ]);

      const result = stats[0] || {
        total: 0,
        sent: 0,
        delivered: 0,
        clicked: 0,
        failed: 0
      };

      res.json({
        success: true,
        ...result,
        userId: parseInt(userId)
      });
    } catch (error) {
      logger.error(`Error fetching user notification stats: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Mark notification as clicked
   * POST /api/push-notifications/:id/clicked
   */
  async markAsClicked(req, res, next) {
    try {
      const { id } = req.params;
      const { url, userAgent } = req.body;

      const notification = await PushNotification.findById(id);

      if (!notification) {
        return res.status(404).json({
          success: false,
          error: 'Push notification not found'
        });
      }

      await notification.markAsClicked({ url, userAgent });

      // If this notification is linked to a purchase, update the purchase record
      if (notification.source && notification.source.referenceModel === 'Purchase' && notification.source.referenceId) {
        const Purchase = require('../models/purchases.model');
        const purchase = await Purchase.findById(notification.source.referenceId);
        
        if (purchase) {
          await purchase.markPurchasePushNotificationClicked();
          logger.info(`Marked purchase ${purchase._id} push notification as clicked`, req.serverInfo);
        }
      }

      logger.info(`Push notification ${id} marked as clicked`, req.serverInfo);

      res.json({
        success: true,
        message: 'Notification marked as clicked'
      });
    } catch (error) {
      logger.error(`Error marking notification as clicked: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Retry failed notifications
   * POST /api/push-notifications/retry
   */
  async retryFailedNotifications(req, res, next) {
    try {
      const { maxRetries = 10 } = req.body;

      const result = await pushNotificationService.retryFailedNotifications(maxRetries);

      logger.info(`Retried ${result.retriedCount} failed notifications`, req.serverInfo);

      res.json({
        success: true,
        data: result,
        message: `Retried ${result.retriedCount} out of ${result.totalFailed} failed notifications`
      });
    } catch (error) {
      logger.error(`Error retrying failed notifications: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get delivery metrics
   * GET /api/push-notifications/metrics
   */
  async getDeliveryMetrics(req, res, next) {
    try {
      const { startDate, endDate } = req.query;

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const metrics = await PushNotification.getDeliveryMetrics(start, end);

      res.json({
        success: true,
        data: metrics,
        period: {
          start: start.toISOString(),
          end: end.toISOString()
        }
      });
    } catch (error) {
      logger.error(`Error fetching delivery metrics: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Clean up old notifications
   * DELETE /api/push-notifications/cleanup
   */
  async cleanupOldNotifications(req, res, next) {
    try {
      const { daysOld = 30 } = req.body;

      const result = await pushNotificationService.cleanupOldNotifications(daysOld);

      logger.info(`Cleaned up ${result.deletedCount} old push notifications`, req.serverInfo);

      res.json({
        success: true,
        data: {
          deletedCount: result.deletedCount
        },
        message: `Cleaned up ${result.deletedCount} notifications older than ${daysOld} days`
      });
    } catch (error) {
      logger.error(`Error cleaning up notifications: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get pending notifications
   * GET /api/push-notifications/pending
   */
  async getPendingNotifications(req, res, next) {
    try {
      const notifications = await PushNotification.getPendingNotifications();

      res.json({
        success: true,
        data: notifications,
        count: notifications.length
      });
    } catch (error) {
      logger.error(`Error fetching pending notifications: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get failed notifications
   * GET /api/push-notifications/failed
   */
  async getFailedNotifications(req, res, next) {
    try {
      const notifications = await PushNotification.getFailedNotifications();

      res.json({
        success: true,
        data: notifications,
        count: notifications.length
      });
    } catch (error) {
      logger.error(`Error fetching failed notifications: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get push notification status by purchase ID
   * GET /api/push-notifications/purchase/:purchaseId/status
   */
  async getNotificationStatusByPurchase(req, res, next) {
    try {
      const { purchaseId } = req.params;

      // Get purchase record with comprehensive tracking
      const Purchase = require('../models/purchases.model');
      const purchase = await Purchase.findById(purchaseId);
      
      if (!purchase) {
        return res.status(404).json({
          success: false,
          error: 'Purchase not found'
        });
      }

      // Get push notification tracking summary
      const pushNotificationSummary = purchase.getPurchasePushNotificationSummary();

      // Find notification linked to this purchase
      const notification = await PushNotification.findOne({
        'source.referenceId': purchaseId,
        'source.referenceModel': 'Purchase'
      }).populate('recipient.fcmTokens', 'token platform status');

      res.json({
        success: true,
        data: {
          // Comprehensive tracking from purchase model
          tracking: pushNotificationSummary,
          // Notification details if found
          notification: notification ? {
            notificationId: notification._id,
            type: notification.type,
            status: notification.status,
            deliveryStatus: notification.deliveryStatus,
            attempts: notification.attempts,
            priority: notification.priority,
            timestamps: notification.timestamps,
            failureReason: notification.failureReason,
            fcmResponse: notification.fcmResponse,
            queueName: notification.queueName,
            createdAt: notification.createdAt,
            updatedAt: notification.updatedAt
          } : null,
          // Delivery history from purchase
          deliveryHistory: purchase.purchasePushNotification?.deliveryHistory || []
        }
      });
    } catch (error) {
      logger.error(`Error fetching notification status by purchase: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Update push notification delivery status
   * PATCH /api/push-notifications/:id/delivery-status
   */
  async updateDeliveryStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;

      const validStatuses = ['sent', 'delivered', 'failed', 'clicked'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const notification = await PushNotification.findById(id);

      if (!notification) {
        return res.status(404).json({
          success: false,
          error: 'Push notification not found'
        });
      }

      // Update notification status based on provided status
      switch (status) {
        case 'sent':
          await notification.markAsSent();
          break;
        case 'delivered':
          await notification.markAsDelivered();
          break;
        case 'failed':
          await notification.markAsFailed(reason || 'Manual status update');
          break;
        case 'clicked':
          await notification.markAsClicked();
          break;
      }

      // If this notification is linked to a purchase, update the purchase record
      if (notification.source.referenceModel === 'Purchase' && notification.source.referenceId) {
        const Purchase = require('../models/purchases.model');
        const purchase = await Purchase.findById(notification.source.referenceId);
        
        if (purchase) {
          purchase.notifications = purchase.notifications || {};
          purchase.notifications.pushDeliveryStatus = status;
          
          if (status === 'delivered') {
            purchase.notifications.pushDeliveredAt = new Date();
          } else if (status === 'failed') {
            purchase.notifications.pushFailureReason = reason || 'Delivery failed';
          }
          
          await purchase.save();
          logger.info(`Updated purchase ${purchase._id} with push notification status: ${status}`, req.serverInfo);
        }
      }

      logger.info(`Updated push notification ${id} delivery status to: ${status}`, req.serverInfo);

      res.json({
        success: true,
        message: `Notification delivery status updated to: ${status}`,
        data: {
          notificationId: notification._id,
          status: notification.status,
          deliveryStatus: notification.deliveryStatus
        }
      });
    } catch (error) {
      logger.error(`Error updating delivery status: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
}

module.exports = new PushNotificationController();