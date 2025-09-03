const ResetPassword = require('../models/resetPasswords.model');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES } = require('../constants');
const logger = require('../utils/logger');
const crypto = require('crypto');

class ResetPasswordController {
  async create(req, res, next) {
    try {
      logger.info(`Received POST /api/reset-passwords with email: ${req.body.email}`, req.serverInfo);
      
      const hashedToken = crypto
        .createHash('sha256')
        .update(req.body.resetToken)
        .digest('hex');
      
      const resetData = {
        ...req.body,
        hashedToken,
        assignedServer: req.serverInfo,
        processedBy: `${req.serverInfo}-${Date.now()}`,
        requestedFrom: {
          ipAddress: req.body.ipAddress || req.ip,
          userAgent: req.body.userAgent || req.get('user-agent'),
          device: req.body.device || 'unknown'
        }
      };
      
      const existingActiveToken = await ResetPassword.findOne({
        userId: resetData.userId,
        tokenUsed: false,
        isExpired: false,
        invalidated: false,
        expiresAt: { $gt: new Date() }
      });
      
      if (existingActiveToken) {
        await existingActiveToken.invalidate('New token requested');
        logger.info(`Invalidated existing token for user ${resetData.userId}`, req.serverInfo);
      }
      
      const resetPassword = new ResetPassword(resetData);
      await resetPassword.save();
      
      logger.success(`Created password reset token: ${resetPassword._id}`, req.serverInfo);

      // Send password reset email notification (fanout architecture)
      try {
        const emailResult = await notificationService.sendNotification(
          NOTIFICATION_TYPES.RESET_PASSWORD,
          {
            email: resetData.email,
            username: resetData.username,
            userId: resetData.userId,
            resetToken: resetData.resetToken,
            resetUrl: resetData.resetUrl || null
          },
          {
            serverInfo: req.serverInfo,
            resetPasswordId: resetPassword._id.toString()
          }
        );
        
        if (emailResult.success) {
          await resetPassword.markEmailSent(emailResult.jobId);
          logger.info(`Password reset email queued successfully for user: ${resetData.username}`, req.serverInfo);
        } else {
          await resetPassword.markEmailFailed(emailResult.reason || 'Failed to queue email');
          logger.warn(`Password reset email queuing failed for user: ${resetData.username}`, req.serverInfo);
        }
      } catch (emailError) {
        // Don't fail the reset request if email fails - log and continue
        await resetPassword.markEmailFailed(emailError.message);
        logger.error(`Failed to queue password reset email for ${resetData.username}: ${emailError.message}`, req.serverInfo);
      }
      
      res.status(201).json({
        success: true,
        server: req.serverInfo,
        data: resetPassword,
        message: 'Password reset token created successfully'
      });
    } catch (error) {
      logger.error(`Error creating password reset: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getAll(req, res, next) {
    try {
      const { 
        tokenUsed, 
        isExpired, 
        userId, 
        limit = 20, 
        skip = 0, 
        sort = '-createdAt' 
      } = req.query;
      
      const query = {};
      
      if (tokenUsed !== undefined) {
        query.tokenUsed = tokenUsed === 'true';
      }
      
      if (isExpired !== undefined) {
        query.isExpired = isExpired === 'true';
      }
      
      if (userId) {
        query.userId = parseInt(userId);
      }
      
      const resets = await ResetPassword.find(query)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort(sort);
      
      const total = await ResetPassword.countDocuments(query);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: resets,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching password resets: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getById(req, res, next) {
    try {
      const reset = await ResetPassword.findById(req.params.id);
      
      if (!reset) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Password reset record not found'
        });
      }
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: reset
      });
    } catch (error) {
      logger.error(`Error fetching password reset: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async validateToken(req, res, next) {
    try {
      const { token } = req.params;
      
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
      
      const reset = await ResetPassword.findOne({
        hashedToken,
        tokenUsed: false,
        isExpired: false,
        invalidated: false,
        expiresAt: { $gt: new Date() }
      });
      
      if (!reset) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Invalid or expired reset token'
        });
      }
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: {
          valid: true,
          userId: reset.userId,
          email: reset.email,
          expiresAt: reset.expiresAt,
          attemptsRemaining: reset.maxAttempts - reset.attemptCount
        }
      });
    } catch (error) {
      logger.error(`Error validating token: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async useToken(req, res, next) {
    try {
      const { token } = req.params;
      const { newPassword } = req.body;
      
      if (!newPassword) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'New password is required'
        });
      }
      
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
      
      const reset = await ResetPassword.findOne({
        hashedToken,
        tokenUsed: false,
        isExpired: false,
        invalidated: false,
        expiresAt: { $gt: new Date() }
      });
      
      if (!reset) {
        const existingReset = await ResetPassword.findOne({ hashedToken });
        if (existingReset) {
          await existingReset.incrementAttempt();
        }
        
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Invalid or expired reset token'
        });
      }
      
      await reset.markAsUsed();
      
      logger.success(`Password reset completed for user ${reset.userId}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        message: 'Password reset successfully',
        data: {
          userId: reset.userId,
          email: reset.email
        }
      });
    } catch (error) {
      logger.error(`Error using reset token: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async resendToken(req, res, next) {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Email is required'
        });
      }
      
      const recentReset = await ResetPassword.findOne({
        email: email.toLowerCase(),
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
      });
      
      if (recentReset) {
        return res.status(429).json({
          success: false,
          server: req.serverInfo,
          error: 'Password reset already requested recently. Please wait 5 minutes before requesting again.'
        });
      }
      
      const newToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto
        .createHash('sha256')
        .update(newToken)
        .digest('hex');
      
      const resetData = {
        email: email.toLowerCase(),
        resetToken: newToken,
        hashedToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        assignedServer: req.serverInfo,
        processedBy: `${req.serverInfo}-${Date.now()}`,
        requestedFrom: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          device: 'web'
        }
      };
      
      const resetPassword = new ResetPassword(resetData);
      await resetPassword.save();
      
      // Send password reset email notification
      try {
        const emailResult = await notificationService.sendNotification(
          NOTIFICATION_TYPES.RESET_PASSWORD,
          {
            email: resetData.email,
            username: resetData.username || null,
            userId: resetData.userId || null,
            resetToken: resetData.resetToken,
            resetUrl: resetData.resetUrl || null
          },
          {
            serverInfo: req.serverInfo,
            resetPasswordId: resetPassword._id.toString()
          }
        );
        
        if (emailResult.success) {
          await resetPassword.markEmailSent(emailResult.jobId);
          logger.info(`Resend password reset email queued successfully for email: ${email}`, req.serverInfo);
        } else {
          await resetPassword.markEmailFailed(emailResult.reason || 'Failed to queue email');
          logger.warn(`Resend password reset email queuing failed for email: ${email}`, req.serverInfo);
        }
      } catch (emailError) {
        await resetPassword.markEmailFailed(emailError.message);
        logger.error(`Failed to queue resend password reset email for ${email}: ${emailError.message}`, req.serverInfo);
      }
      
      logger.info(`Resent password reset token for email: ${email}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        message: 'Password reset token sent successfully',
        data: {
          email,
          expiresAt: resetPassword.expiresAt,
          emailStatus: resetPassword.emailNotification?.emailDeliveryStatus || 'pending'
        }
      });
    } catch (error) {
      logger.error(`Error resending reset token: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async invalidateToken(req, res, next) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const reset = await ResetPassword.findById(id);
      
      if (!reset) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Password reset record not found'
        });
      }
      
      await reset.invalidate(reason || 'Manually invalidated');
      
      logger.info(`Invalidated reset token: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        message: 'Reset token invalidated successfully'
      });
    } catch (error) {
      logger.error(`Error invalidating token: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getActiveTokens(req, res, next) {
    try {
      const activeTokens = await ResetPassword.findActiveTokens();
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: activeTokens,
        count: activeTokens.length
      });
    } catch (error) {
      logger.error(`Error fetching active tokens: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async cleanupExpired(req, res, next) {
    try {
      const result = await ResetPassword.cleanupExpiredTokens();
      
      logger.info(`Cleaned up ${result.modifiedCount} expired tokens`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        cleanedUp: result.modifiedCount,
        message: `Marked ${result.modifiedCount} tokens as expired`
      });
    } catch (error) {
      logger.error(`Error cleaning up expired tokens: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getStatistics(req, res, next) {
    try {
      const stats = await ResetPassword.getResetStatistics();
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: stats
      });
    } catch (error) {
      logger.error(`Error fetching reset statistics: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async answerSecurityQuestion(req, res, next) {
    try {
      const { id } = req.params;
      const { question, answer } = req.body;
      
      const reset = await ResetPassword.findById(id);
      
      if (!reset) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Password reset record not found'
        });
      }
      
      if (!reset.securityQuestions) {
        reset.securityQuestions = [];
      }
      
      reset.securityQuestions.push({
        question,
        answeredCorrectly: true,
        answeredAt: new Date()
      });
      
      await reset.save();
      
      logger.info(`Security question answered for reset: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        message: 'Security question answered successfully',
        data: {
          questionsAnswered: reset.securityQuestions.length
        }
      });
    } catch (error) {
      logger.error(`Error answering security question: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
}

module.exports = new ResetPasswordController();