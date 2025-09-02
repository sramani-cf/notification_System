const express = require('express');
const router = express.Router();
const resetPasswordController = require('../controllers/resetPassword.controller');
const { 
  validateObjectId, 
  validatePagination,
  validateResetPassword 
} = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

router.route('/')
  .get(
    validatePagination,
    asyncHandler(resetPasswordController.getAll)
  )
  .post(
    validateResetPassword,
    asyncHandler(resetPasswordController.create)
  );

router.route('/resend')
  .post(asyncHandler(resetPasswordController.resendToken));

router.route('/active')
  .get(asyncHandler(resetPasswordController.getActiveTokens));

router.route('/cleanup')
  .post(asyncHandler(resetPasswordController.cleanupExpired));

router.route('/statistics')
  .get(asyncHandler(resetPasswordController.getStatistics));

router.route('/token/:token/validate')
  .get(asyncHandler(resetPasswordController.validateToken));

router.route('/token/:token/use')
  .post(asyncHandler(resetPasswordController.useToken));

router.route('/:id')
  .get(
    validateObjectId,
    asyncHandler(resetPasswordController.getById)
  );

router.route('/:id/invalidate')
  .post(
    validateObjectId,
    asyncHandler(resetPasswordController.invalidateToken)
  );

router.route('/:id/security-question')
  .post(
    validateObjectId,
    asyncHandler(resetPasswordController.answerSecurityQuestion)
  );

module.exports = router;