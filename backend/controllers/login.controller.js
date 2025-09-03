const Login = require('../models/logins.model');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES } = require('../constants');
const logger = require('../utils/logger');
const crypto = require('crypto');

class LoginController {
  async create(req, res, next) {
    try {
      logger.info(`Received POST /api/logins with body: ${JSON.stringify({...req.body, password: '***'})}`, req.serverInfo);
      
      const loginData = {
        ...req.body,
        assignedServer: req.serverInfo,
        processedBy: `${req.serverInfo}-${Date.now()}`
      };
      
      const recentFailedAttempts = await Login.getFailedLogins(loginData.userId, 1);
      if (recentFailedAttempts.length >= 5) {
        loginData.isSuspicious = true;
        loginData.suspiciousReasons = loginData.suspiciousReasons || [];
        loginData.suspiciousReasons.push('multiple_failed_attempts');
        loginData.twoFactorRequired = true;
      }
      
      const login = new Login(loginData);
      await login.save();
      
      if (login.isSuspicious) {
        logger.warn(`Suspicious login attempt detected for user ${login.userId}`, req.serverInfo);
      }
      
      logger.success(`Created login record: ${login._id}`, req.serverInfo);

      // Send login alert email notification (fanout architecture)
      try {
        logger.info(`Attempting to send login alert email for user: ${login.username}`, req.serverInfo);
        
        // Mark email as pending before queueing
        await login.updateLoginAlertEmailStatus('pending');
        
        const emailResult = await notificationService.sendNotification(
          NOTIFICATION_TYPES.LOGIN,
          {
            email: loginData.email,
            username: loginData.username,
            userId: loginData.userId,
            loginTime: loginData.loginTimestamp || new Date(),
            ipAddress: loginData.ipAddress,
            userAgent: loginData.userAgent,
            location: loginData.location
          },
          {
            serverInfo: req.serverInfo,
            loginId: login._id.toString() // Pass login ID for tracking
          }
        );
        
        // Update login record with queue information
        if (emailResult && emailResult.success) {
          await login.markLoginAlertEmailQueued(emailResult.jobId, emailResult.notificationId);
          logger.success(`Login alert email queued successfully for user: ${login.username} (Job ID: ${emailResult.jobId}, Notification ID: ${emailResult.notificationId})`, req.serverInfo);
        } else {
          const reason = emailResult?.reason || 'Unknown error during email queuing';
          await login.markLoginAlertEmailFailed(reason);
          logger.error(`Login alert email queuing failed for user: ${login.username}. Reason: ${reason}`, req.serverInfo);
        }
      } catch (emailError) {
        // Mark email as failed if queueing fails
        const errorMessage = `Failed to queue: ${emailError.message}`;
        await login.markLoginAlertEmailFailed(errorMessage);
        logger.error(`Exception while queueing login alert email for ${login.username}: ${emailError.message}`, req.serverInfo);
        
        // Log the full error stack for debugging
        if (emailError.stack) {
          logger.error(`Error stack: ${emailError.stack}`, req.serverInfo);
        }
        
        // Check for specific error types
        if (emailError.message.includes('not ready')) {
          logger.error('Email service not ready - check Redis connection and SMTP configuration', req.serverInfo);
        } else if (emailError.message.includes('not available')) {
          logger.error('Email service not available - check SMTP credentials and connection', req.serverInfo);
        } else if (emailError.message.includes('Queue manager not initialized')) {
          logger.error('Queue manager not initialized - check Redis connection', req.serverInfo);
        }
      }
      
      res.status(201).json({
        success: true,
        server: req.serverInfo,
        data: login,
        message: 'Login record created successfully'
      });
    } catch (error) {
      logger.error(`Error creating login record: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getAll(req, res, next) {
    try {
      const { 
        loginSuccessful, 
        isSuspicious, 
        userId, 
        limit = 20, 
        skip = 0, 
        sort = '-createdAt' 
      } = req.query;
      
      const query = {};
      
      if (loginSuccessful !== undefined) {
        query.loginSuccessful = loginSuccessful === 'true';
      }
      
      if (isSuspicious !== undefined) {
        query.isSuspicious = isSuspicious === 'true';
      }
      
      if (userId) {
        query.userId = parseInt(userId);
      }
      
      const logins = await Login.find(query)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort(sort)
        .select('-password');
      
      const total = await Login.countDocuments(query);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: logins,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching logins: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getById(req, res, next) {
    try {
      const login = await Login.findById(req.params.id).select('-password');
      
      if (!login) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Login record not found'
        });
      }
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: login
      });
    } catch (error) {
      logger.error(`Error fetching login: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getFailedAttempts(req, res, next) {
    try {
      const { userId } = req.params;
      const { hoursAgo = 24 } = req.query;
      
      const failedLogins = await Login.getFailedLogins(
        parseInt(userId), 
        parseInt(hoursAgo)
      );
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: failedLogins,
        count: failedLogins.length,
        hoursAgo: parseInt(hoursAgo)
      });
    } catch (error) {
      logger.error(`Error fetching failed login attempts: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getSuspiciousLogins(req, res, next) {
    try {
      const { limit = 100 } = req.query;
      const suspiciousLogins = await Login.getSuspiciousLogins(parseInt(limit));
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: suspiciousLogins,
        count: suspiciousLogins.length
      });
    } catch (error) {
      logger.error(`Error fetching suspicious logins: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async verifySession(req, res, next) {
    try {
      const { sessionToken } = req.params;
      
      const login = await Login.findOne({ 
        sessionToken,
        loginSuccessful: true,
        sessionExpiresAt: { $gt: new Date() }
      }).select('-password');
      
      if (!login) {
        return res.status(401).json({
          success: false,
          server: req.serverInfo,
          error: 'Invalid or expired session token'
        });
      }
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: {
          valid: true,
          userId: login.userId,
          expiresAt: login.sessionExpiresAt,
          login
        }
      });
    } catch (error) {
      logger.error(`Error verifying session: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async logout(req, res, next) {
    try {
      const { sessionToken } = req.params;
      
      const login = await Login.findOneAndUpdate(
        { sessionToken },
        { 
          sessionExpiresAt: new Date(),
          $set: { 'metadata.loggedOutAt': new Date() }
        },
        { new: true }
      );
      
      if (!login) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Session not found'
        });
      }
      
      logger.info(`User ${login.userId} logged out successfully`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        message: 'Logged out successfully'
      });
    } catch (error) {
      logger.error(`Error during logout: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getStatistics(req, res, next) {
    try {
      const stats = await Login.getLoginStatistics();
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: stats
      });
    } catch (error) {
      logger.error(`Error fetching login statistics: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async updateLoginStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { loginSuccessful, failureReason } = req.body;
      
      const updateData = {};
      if (loginSuccessful !== undefined) {
        updateData.loginSuccessful = loginSuccessful;
      }
      if (failureReason) {
        updateData.failureReason = failureReason;
      }
      
      const login = await Login.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');
      
      if (!login) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Login record not found'
        });
      }
      
      logger.info(`Updated login status for record: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: login,
        message: 'Login status updated successfully'
      });
    } catch (error) {
      logger.error(`Error updating login status: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async completeTwoFactor(req, res, next) {
    try {
      const { id } = req.params;
      const { code } = req.body;
      
      const login = await Login.findById(id);
      
      if (!login) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Login record not found'
        });
      }
      
      if (!login.twoFactorRequired) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Two-factor authentication not required for this login'
        });
      }
      
      login.twoFactorCompleted = true;
      login.loginSuccessful = true;
      await login.save();
      
      logger.success(`Two-factor authentication completed for login: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: login,
        message: 'Two-factor authentication completed successfully'
      });
    } catch (error) {
      logger.error(`Error completing two-factor auth: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async deleteOldRecords(req, res, next) {
    try {
      const { daysOld = 90 } = req.query;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysOld));
      
      const result = await Login.deleteMany({
        createdAt: { $lt: cutoffDate }
      });
      
      logger.info(`Deleted ${result.deletedCount} old login records`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        deletedCount: result.deletedCount,
        message: `Deleted login records older than ${daysOld} days`
      });
    } catch (error) {
      logger.error(`Error deleting old records: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  async getLoginAlertEmailStatus(req, res, next) {
    try {
      const { id } = req.params;
      const login = await Login.findById(id);
      
      if (!login) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Login record not found'
        });
      }

      const emailSummary = login.getLoginAlertEmailSummary();
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: {
          loginId: login._id,
          username: login.username,
          email: login.email,
          loginAlertEmail: emailSummary,
          fullHistory: login.loginAlertEmail?.deliveryHistory || []
        }
      });
    } catch (error) {
      logger.error(`Error fetching login alert email status: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  async getFailedLoginAlertEmails(req, res, next) {
    try {
      const { limit = 20, skip = 0 } = req.query;
      
      const failedEmails = await Login.getFailedLoginAlertEmails()
        .limit(parseInt(limit))
        .skip(parseInt(skip));
      
      const total = await Login.countDocuments({ 'loginAlertEmail.status': 'failed' });
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: failedEmails.map(login => ({
          loginId: login._id,
          username: login.username,
          email: login.email,
          createdAt: login.createdAt,
          loginAlertEmail: login.getLoginAlertEmailSummary()
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching failed login alert emails: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  async getPendingLoginAlertEmails(req, res, next) {
    try {
      const { limit = 20, skip = 0 } = req.query;
      
      const pendingEmails = await Login.getPendingLoginAlertEmails()
        .limit(parseInt(limit))
        .skip(parseInt(skip));
      
      const total = await Login.countDocuments({ 
        'loginAlertEmail.status': { $in: ['pending', 'queued', 'sending'] } 
      });
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: pendingEmails.map(login => ({
          loginId: login._id,
          username: login.username,
          email: login.email,
          createdAt: login.createdAt,
          loginAlertEmail: login.getLoginAlertEmailSummary()
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching pending login alert emails: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
}

module.exports = new LoginController();