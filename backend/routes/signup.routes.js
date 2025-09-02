const express = require('express');
const router = express.Router();
const signupController = require('../controllers/signup.controller');
const { 
  validateObjectId, 
  validatePagination,
  validateSignup,
  validateUserId 
} = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

// Main routes
router.route('/')
  .get(
    validatePagination,
    asyncHandler(signupController.getAll)
  )
  .post(
    validateSignup,
    asyncHandler(signupController.create)
  );

// Statistics and special routes
router.route('/statistics')
  .get(asyncHandler(signupController.getStatistics));

router.route('/unverified')
  .get(asyncHandler(signupController.getUnverified));

// User-specific route
router.route('/user/:userId')
  .get(
    validateUserId,
    asyncHandler(signupController.getByUserId)
  );

// Email verification
router.route('/verify/:token')
  .post(asyncHandler(signupController.verifyEmail));

// ID-based routes
router.route('/:id')
  .get(
    validateObjectId,
    asyncHandler(signupController.getById)
  )
  .put(
    validateObjectId,
    asyncHandler(signupController.update)
  )
  .delete(
    validateObjectId,
    asyncHandler(signupController.delete)
  );

module.exports = router;