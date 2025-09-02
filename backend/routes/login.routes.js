const express = require('express');
const router = express.Router();
const loginController = require('../controllers/login.controller');
const { 
  validateObjectId, 
  validatePagination, 
  validateLogin,
  validateUserId,
  validateSessionToken 
} = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

router.route('/')
  .get(
    validatePagination,
    asyncHandler(loginController.getAll)
  )
  .post(
    validateLogin,
    asyncHandler(loginController.create)
  );

router.route('/statistics')
  .get(asyncHandler(loginController.getStatistics));

router.route('/suspicious')
  .get(asyncHandler(loginController.getSuspiciousLogins));

router.route('/cleanup')
  .delete(asyncHandler(loginController.deleteOldRecords));

router.route('/user/:userId/failed')
  .get(
    validateUserId,
    asyncHandler(loginController.getFailedAttempts)
  );

router.route('/session/:sessionToken/verify')
  .get(
    validateSessionToken,
    asyncHandler(loginController.verifySession)
  );

router.route('/session/:sessionToken/logout')
  .post(
    validateSessionToken,
    asyncHandler(loginController.logout)
  );

router.route('/:id')
  .get(
    validateObjectId,
    asyncHandler(loginController.getById)
  );

router.route('/:id/status')
  .patch(
    validateObjectId,
    asyncHandler(loginController.updateLoginStatus)
  );

router.route('/:id/two-factor')
  .post(
    validateObjectId,
    asyncHandler(loginController.completeTwoFactor)
  );

module.exports = router;