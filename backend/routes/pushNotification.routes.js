const express = require('express');
const router = express.Router();
const pushNotificationController = require('../controllers/pushNotification.controller');
const { asyncHandler } = require('../middleware/errorHandler');

// Notification management
router.route('/')
  .get(asyncHandler(pushNotificationController.getNotifications));

router.route('/test')
  .post(asyncHandler(pushNotificationController.sendTestNotification));

router.route('/batch')
  .post(asyncHandler(pushNotificationController.sendBatchNotifications));

router.route('/statistics')
  .get(asyncHandler(pushNotificationController.getStatistics));

router.route('/metrics')
  .get(asyncHandler(pushNotificationController.getDeliveryMetrics));

router.route('/retry')
  .post(asyncHandler(pushNotificationController.retryFailedNotifications));

router.route('/cleanup')
  .delete(asyncHandler(pushNotificationController.cleanupOldNotifications));

router.route('/pending')
  .get(asyncHandler(pushNotificationController.getPendingNotifications));

router.route('/failed')
  .get(asyncHandler(pushNotificationController.getFailedNotifications));

router.route('/user/:userId')
  .get(asyncHandler(pushNotificationController.getUserNotificationHistory));

router.route('/user/:userId/stats')
  .get(asyncHandler(pushNotificationController.getUserNotificationStats));

router.route('/purchase/:purchaseId/status')
  .get(asyncHandler(pushNotificationController.getNotificationStatusByPurchase));

router.route('/:id')
  .get(asyncHandler(pushNotificationController.getNotificationById));

router.route('/:id/clicked')
  .post(asyncHandler(pushNotificationController.markAsClicked));

router.route('/:id/delivery-status')
  .patch(asyncHandler(pushNotificationController.updateDeliveryStatus));

module.exports = router;