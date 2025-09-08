const express = require('express');
const router = express.Router();
const fcmTokenController = require('../controllers/fcmToken.controller');
const { asyncHandler } = require('../middleware/errorHandler');

// Token management
router.route('/')
  .post(asyncHandler(fcmTokenController.registerToken));

router.route('/bulk')
  .post(asyncHandler(fcmTokenController.bulkRegister));

router.route('/refresh')
  .post(asyncHandler(fcmTokenController.refreshToken));

router.route('/validate')
  .post(asyncHandler(fcmTokenController.validateTokens));

router.route('/statistics')
  .get(asyncHandler(fcmTokenController.getStatistics));

router.route('/mark-stale')
  .post(asyncHandler(fcmTokenController.markStaleTokens));

router.route('/cleanup')
  .delete(asyncHandler(fcmTokenController.cleanupExpired));

router.route('/user/:userId')
  .get(asyncHandler(fcmTokenController.getUserTokens));

router.route('/:id')
  .put(asyncHandler(fcmTokenController.updateToken));

router.route('/:token')
  .delete(asyncHandler(fcmTokenController.removeToken));

router.route('/:token/permissions')
  .patch(asyncHandler(fcmTokenController.updatePermissions));

module.exports = router;