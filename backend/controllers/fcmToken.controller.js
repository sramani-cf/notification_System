const fcmTokenService = require('../services/fcmTokenService');
const logger = require('../utils/logger');

class FcmTokenController {
  /**
   * Register a new FCM token
   * POST /api/fcm-tokens
   */
  async registerToken(req, res, next) {
    try {
      const { token, deviceInfo, permissions } = req.body;
      const userId = req.body.userId || req.user?.id; // Support both direct userId and from auth

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'FCM token is required'
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: 'User ID is required'
        });
      }

      const tokenData = {
        userId,
        token,
        deviceInfo: deviceInfo || {
          platform: 'web',
          browser: req.headers['user-agent']
        },
        permissions,
        ipAddress: req.ip,
        sessionId: req.sessionID
      };

      const registeredToken = await fcmTokenService.registerToken(tokenData);

      logger.success(`FCM token registered for user ${userId}`, req.serverInfo);

      res.status(201).json({
        success: true,
        data: {
          tokenId: registeredToken._id,
          userId: registeredToken.userId,
          isActive: registeredToken.isActive
        },
        message: 'FCM token registered successfully'
      });
    } catch (error) {
      logger.error(`Error registering FCM token: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Update an existing FCM token
   * PUT /api/fcm-tokens/:id
   */
  async updateToken(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const updatedToken = await fcmTokenService.updateToken(id, updates);

      logger.info(`FCM token ${id} updated`, req.serverInfo);

      res.json({
        success: true,
        data: updatedToken,
        message: 'FCM token updated successfully'
      });
    } catch (error) {
      logger.error(`Error updating FCM token: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Refresh an FCM token
   * POST /api/fcm-tokens/refresh
   */
  async refreshToken(req, res, next) {
    try {
      const { oldToken, newToken } = req.body;

      if (!oldToken || !newToken) {
        return res.status(400).json({
          success: false,
          error: 'Both old and new tokens are required'
        });
      }

      const refreshedToken = await fcmTokenService.refreshToken(oldToken, newToken);

      logger.info(`FCM token refreshed for user ${refreshedToken.userId}`, req.serverInfo);

      res.json({
        success: true,
        data: {
          tokenId: refreshedToken._id,
          userId: refreshedToken.userId,
          refreshCount: refreshedToken.tokenRefreshCount
        },
        message: 'FCM token refreshed successfully'
      });
    } catch (error) {
      logger.error(`Error refreshing FCM token: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Remove an FCM token
   * DELETE /api/fcm-tokens/:token
   */
  async removeToken(req, res, next) {
    try {
      const { token } = req.params;

      const removed = await fcmTokenService.removeToken(decodeURIComponent(token));

      if (!removed) {
        return res.status(404).json({
          success: false,
          error: 'FCM token not found'
        });
      }

      logger.info(`FCM token removed`, req.serverInfo);

      res.json({
        success: true,
        message: 'FCM token removed successfully'
      });
    } catch (error) {
      logger.error(`Error removing FCM token: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get user's FCM tokens
   * GET /api/fcm-tokens/user/:userId
   */
  async getUserTokens(req, res, next) {
    try {
      const { userId } = req.params;
      const { includeStale } = req.query;

      const tokens = await fcmTokenService.getUserTokens(
        parseInt(userId),
        includeStale === 'true'
      );

      res.json({
        success: true,
        data: tokens,
        count: tokens.length
      });
    } catch (error) {
      logger.error(`Error fetching user tokens: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Validate FCM tokens
   * POST /api/fcm-tokens/validate
   */
  async validateTokens(req, res, next) {
    try {
      const { tokens } = req.body;

      if (!Array.isArray(tokens)) {
        return res.status(400).json({
          success: false,
          error: 'Tokens must be an array'
        });
      }

      const results = await Promise.all(
        tokens.map(token => fcmTokenService.validateToken(token))
      );

      res.json({
        success: true,
        data: results,
        validCount: results.filter(r => r.valid).length,
        invalidCount: results.filter(r => !r.valid).length
      });
    } catch (error) {
      logger.error(`Error validating tokens: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Update token permissions
   * PATCH /api/fcm-tokens/:token/permissions
   */
  async updatePermissions(req, res, next) {
    try {
      const { token } = req.params;
      const { permissions } = req.body;

      if (!permissions) {
        return res.status(400).json({
          success: false,
          error: 'Permissions object is required'
        });
      }

      const updatedToken = await fcmTokenService.updateTokenPermissions(
        decodeURIComponent(token),
        permissions
      );

      logger.info(`FCM token permissions updated`, req.serverInfo);

      res.json({
        success: true,
        data: updatedToken.permissions,
        message: 'Token permissions updated successfully'
      });
    } catch (error) {
      logger.error(`Error updating token permissions: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Get token statistics
   * GET /api/fcm-tokens/statistics
   */
  async getStatistics(req, res, next) {
    try {
      const stats = await fcmTokenService.getTokenStatistics();

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error(`Error fetching token statistics: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Bulk register tokens
   * POST /api/fcm-tokens/bulk
   */
  async bulkRegister(req, res, next) {
    try {
      const { tokens } = req.body;

      if (!Array.isArray(tokens)) {
        return res.status(400).json({
          success: false,
          error: 'Tokens must be an array'
        });
      }

      const results = await fcmTokenService.bulkRegisterTokens(tokens);

      logger.info(`Bulk registered ${results.successful.length} tokens`, req.serverInfo);

      res.status(201).json({
        success: true,
        data: results,
        message: `Successfully registered ${results.successful.length} tokens`
      });
    } catch (error) {
      logger.error(`Error bulk registering tokens: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Mark stale tokens
   * POST /api/fcm-tokens/mark-stale
   */
  async markStaleTokens(req, res, next) {
    try {
      const result = await fcmTokenService.markStaleTokens();

      logger.info(`Marked ${result.modifiedCount} tokens as stale`, req.serverInfo);

      res.json({
        success: true,
        data: {
          modifiedCount: result.modifiedCount
        },
        message: `Marked ${result.modifiedCount} tokens as stale`
      });
    } catch (error) {
      logger.error(`Error marking stale tokens: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  /**
   * Clean up expired tokens
   * DELETE /api/fcm-tokens/cleanup
   */
  async cleanupExpired(req, res, next) {
    try {
      const result = await fcmTokenService.cleanupExpiredTokens();

      logger.info(`Cleaned up ${result.deletedCount} expired tokens`, req.serverInfo);

      res.json({
        success: true,
        data: {
          deletedCount: result.deletedCount
        },
        message: `Cleaned up ${result.deletedCount} expired tokens`
      });
    } catch (error) {
      logger.error(`Error cleaning up tokens: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
}

module.exports = new FcmTokenController();