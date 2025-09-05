const express = require('express');
const router = express.Router();
const friendRequestController = require('../controllers/friendRequest.controller');
const { 
  validateObjectId, 
  validatePagination,
  validateFriendRequest,
  validateUserId 
} = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

// Main routes
router.route('/')
  .get(
    validatePagination,
    asyncHandler(friendRequestController.getAll)
  )
  .post(
    validateFriendRequest,
    asyncHandler(friendRequestController.create)
  );

// Statistics and maintenance
router.route('/statistics')
  .get(asyncHandler(friendRequestController.getStatistics));

router.route('/cleanup')
  .post(asyncHandler(friendRequestController.cleanupExpired));

// Notification tracking routes
router.route('/notifications/failed')
  .get(asyncHandler(friendRequestController.getFailedNotifications));

router.route('/notifications/pending')
  .get(asyncHandler(friendRequestController.getPendingNotifications));

// Check existing request
router.route('/check')
  .get(asyncHandler(friendRequestController.checkExisting));

// User-specific routes
router.route('/user/:userId/pending')
  .get(
    validateUserId,
    asyncHandler(friendRequestController.getPending)
  );

router.route('/user/:userId/sent')
  .get(
    validateUserId,
    asyncHandler(friendRequestController.getSent)
  );

router.route('/user/:userId/friends')
  .get(
    validateUserId,
    asyncHandler(friendRequestController.getFriends)
  );

// ID-based routes
router.route('/:id')
  .get(
    validateObjectId,
    asyncHandler(friendRequestController.getById)
  )
  .delete(
    validateObjectId,
    asyncHandler(friendRequestController.delete)
  );

// Action routes
router.route('/:id/accept')
  .patch(
    validateObjectId,
    asyncHandler(friendRequestController.accept)
  );

router.route('/:id/reject')
  .patch(
    validateObjectId,
    asyncHandler(friendRequestController.reject)
  );

router.route('/:id/cancel')
  .patch(
    validateObjectId,
    asyncHandler(friendRequestController.cancel)
  );

router.route('/:id/block')
  .patch(
    validateObjectId,
    asyncHandler(friendRequestController.block)
  );

router.route('/:id/relationship-type')
  .patch(
    validateObjectId,
    asyncHandler(friendRequestController.updateRelationshipType)
  );

module.exports = router;