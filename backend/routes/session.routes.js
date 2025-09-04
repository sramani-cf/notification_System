const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/session.controller');

// Session routes
router.post('/', sessionController.createSession);
router.get('/active', sessionController.getActiveSessions);
router.get('/:sessionToken', sessionController.getSession);
router.post('/validate', sessionController.validateSession);

module.exports = router;