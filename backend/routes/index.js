const express = require('express');
const router = express.Router();

const healthRoutes = require('./health.routes');
const loginRoutes = require('./login.routes');
const resetPasswordRoutes = require('./resetPassword.routes');
const purchaseRoutes = require('./purchase.routes');
const signupRoutes = require('./signup.routes');
const friendRequestRoutes = require('./friendRequest.routes');
const sessionRoutes = require('./session.routes');

const { attachServerInfo, logRequest, sanitizeInput } = require('../middleware/auth');

router.use(attachServerInfo);
router.use(logRequest);
router.use(sanitizeInput);

router.use('/', healthRoutes);
router.use('/signups', signupRoutes);
router.use('/logins', loginRoutes);
router.use('/reset-passwords', resetPasswordRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/friend-requests', friendRequestRoutes);
router.use('/session', sessionRoutes);
router.use('/sessions', sessionRoutes);

module.exports = router;