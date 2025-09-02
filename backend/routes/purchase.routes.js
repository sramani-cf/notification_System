const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchase.controller');
const { 
  validateObjectId, 
  validatePagination,
  validatePurchase,
  validateUserId 
} = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');

router.route('/')
  .get(
    validatePagination,
    asyncHandler(purchaseController.getAll)
  )
  .post(
    validatePurchase,
    asyncHandler(purchaseController.create)
  );

router.route('/statistics')
  .get(asyncHandler(purchaseController.getStatistics));

router.route('/order/:orderId')
  .get(asyncHandler(purchaseController.getByOrderId));

router.route('/user/:userId')
  .get(
    validateUserId,
    asyncHandler(purchaseController.getUserPurchases)
  );

router.route('/status/:status')
  .get(asyncHandler(purchaseController.getOrdersByStatus));

router.route('/:id')
  .get(
    validateObjectId,
    asyncHandler(purchaseController.getById)
  )
  .delete(
    validateObjectId,
    asyncHandler(purchaseController.deleteOrder)
  );

router.route('/:id/order-status')
  .patch(
    validateObjectId,
    asyncHandler(purchaseController.updateOrderStatus)
  );

router.route('/:id/payment-status')
  .patch(
    validateObjectId,
    asyncHandler(purchaseController.updatePaymentStatus)
  );

router.route('/:id/refund')
  .post(
    validateObjectId,
    asyncHandler(purchaseController.processRefund)
  );

router.route('/:id/shipping')
  .patch(
    validateObjectId,
    asyncHandler(purchaseController.updateShipping)
  );

router.route('/:id/discount')
  .post(
    validateObjectId,
    asyncHandler(purchaseController.applyDiscount)
  );

module.exports = router;