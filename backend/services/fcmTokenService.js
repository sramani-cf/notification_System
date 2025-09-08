const FcmToken = require('../models/fcmToken.model');
const logger = require('../utils/logger');

class FcmTokenService {
  /**
   * Register a new FCM token
   */
  async registerToken(tokenData) {
    try {
      const { userId, token, deviceInfo, permissions } = tokenData;

      // Validate token format
      if (!FcmToken.validateTokenFormat(token)) {
        throw new Error('Invalid FCM token format');
      }

      // Check if token already exists
      let existingToken = await FcmToken.findByToken(token);
      
      if (existingToken) {
        // Token exists - update it
        if (existingToken.userId !== userId) {
          // Token belongs to different user - reassign it
          logger.warn(`Reassigning token from user ${existingToken.userId} to ${userId}`, 'FCM-TOKEN-SERVICE');
        }
        
        existingToken.userId = userId;
        existingToken.deviceInfo = { ...existingToken.deviceInfo, ...deviceInfo };
        existingToken.permissions = { ...existingToken.permissions, ...permissions };
        existingToken.lastActivityAt = new Date();
        existingToken.isActive = true;
        existingToken.isStale = false;
        
        await existingToken.updateActivity();
        
        logger.info(`Updated existing FCM token for user ${userId}`, 'FCM-TOKEN-SERVICE');
        return existingToken;
      } else {
        // Create new token
        const newToken = new FcmToken({
          userId,
          token,
          deviceInfo: deviceInfo || {},
          permissions: permissions || {
            notifications: true,
            purchase: true,
            friendRequest: true,
            login: true,
            marketing: false
          },
          registrationSource: deviceInfo?.platform === 'web' ? 'web_app' : 'mobile_app',
          metadata: {
            registeredBy: `USER-${userId}`,
            ipAddress: tokenData.ipAddress,
            sessionId: tokenData.sessionId
          }
        });
        
        await newToken.save();
        
        logger.success(`Registered new FCM token for user ${userId}`, 'FCM-TOKEN-SERVICE');
        return newToken;
      }
    } catch (error) {
      logger.error(`Failed to register FCM token: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Update an existing FCM token
   */
  async updateToken(tokenId, updates) {
    try {
      const token = await FcmToken.findById(tokenId);
      
      if (!token) {
        throw new Error('FCM token not found');
      }

      // Update allowed fields
      if (updates.deviceInfo) {
        token.deviceInfo = { ...token.deviceInfo, ...updates.deviceInfo };
      }
      
      if (updates.permissions) {
        token.permissions = { ...token.permissions, ...updates.permissions };
      }
      
      if (updates.metadata) {
        token.metadata = { ...token.metadata, ...updates.metadata };
      }

      // Update activity
      await token.updateActivity();
      
      logger.info(`Updated FCM token ${tokenId}`, 'FCM-TOKEN-SERVICE');
      return token;
    } catch (error) {
      logger.error(`Failed to update FCM token: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Refresh an FCM token
   */
  async refreshToken(oldToken, newToken) {
    try {
      // Validate new token format
      if (!FcmToken.validateTokenFormat(newToken)) {
        throw new Error('Invalid new FCM token format');
      }

      const existingToken = await FcmToken.findByToken(oldToken);
      
      if (!existingToken) {
        throw new Error('Original FCM token not found');
      }

      // Check if new token already exists
      const duplicateToken = await FcmToken.findByToken(newToken);
      if (duplicateToken) {
        // Remove the old token
        await FcmToken.findByIdAndDelete(existingToken._id);
        
        // Update the duplicate token's activity
        await duplicateToken.updateActivity();
        return duplicateToken;
      }

      // Update the token
      await existingToken.refreshToken(newToken);
      
      logger.info(`Refreshed FCM token for user ${existingToken.userId}`, 'FCM-TOKEN-SERVICE');
      return existingToken;
    } catch (error) {
      logger.error(`Failed to refresh FCM token: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Remove an FCM token
   */
  async removeToken(token) {
    try {
      const fcmToken = await FcmToken.findByToken(token);
      
      if (!fcmToken) {
        logger.warn(`FCM token not found for removal: ${token}`, 'FCM-TOKEN-SERVICE');
        return false;
      }

      await FcmToken.findByIdAndDelete(fcmToken._id);
      
      logger.info(`Removed FCM token for user ${fcmToken.userId}`, 'FCM-TOKEN-SERVICE');
      return true;
    } catch (error) {
      logger.error(`Failed to remove FCM token: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Get all active tokens for a user
   */
  async getUserTokens(userId, includeStale = false) {
    try {
      let query = { userId };
      
      if (!includeStale) {
        query.isActive = true;
        query.isStale = false;
        query.expiresAt = { $gt: new Date() };
      }

      const tokens = await FcmToken.find(query).sort('-lastActivityAt');
      
      return tokens;
    } catch (error) {
      logger.error(`Failed to get user tokens: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Validate a token
   */
  async validateToken(token) {
    try {
      const fcmToken = await FcmToken.findByToken(token);
      
      if (!fcmToken) {
        return { valid: false, reason: 'Token not found' };
      }

      if (!fcmToken.isValid()) {
        return { valid: false, reason: 'Token is inactive or stale' };
      }

      // Update activity on validation
      await fcmToken.updateActivity();
      
      return { valid: true, token: fcmToken };
    } catch (error) {
      logger.error(`Failed to validate FCM token: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Mark tokens as stale
   */
  async markStaleTokens() {
    try {
      const result = await FcmToken.markStaleTokens();
      
      logger.info(`Marked ${result.modifiedCount} tokens as stale`, 'FCM-TOKEN-SERVICE');
      return result;
    } catch (error) {
      logger.error(`Failed to mark stale tokens: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens() {
    try {
      const result = await FcmToken.cleanupExpiredTokens();
      
      logger.info(`Cleaned up ${result.deletedCount} expired tokens`, 'FCM-TOKEN-SERVICE');
      return result;
    } catch (error) {
      logger.error(`Failed to cleanup expired tokens: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Update token permissions
   */
  async updateTokenPermissions(token, permissions) {
    try {
      const fcmToken = await FcmToken.findByToken(token);
      
      if (!fcmToken) {
        throw new Error('FCM token not found');
      }

      await fcmToken.updatePermissions(permissions);
      
      logger.info(`Updated permissions for token ${fcmToken._id}`, 'FCM-TOKEN-SERVICE');
      return fcmToken;
    } catch (error) {
      logger.error(`Failed to update token permissions: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Get token statistics
   */
  async getTokenStatistics() {
    try {
      const stats = await FcmToken.getTokenStatistics();
      return stats;
    } catch (error) {
      logger.error(`Failed to get token statistics: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Bulk register tokens
   */
  async bulkRegisterTokens(tokens) {
    try {
      const results = {
        successful: [],
        failed: []
      };

      for (const tokenData of tokens) {
        try {
          const registered = await this.registerToken(tokenData);
          results.successful.push({
            userId: tokenData.userId,
            tokenId: registered._id
          });
        } catch (error) {
          results.failed.push({
            userId: tokenData.userId,
            error: error.message
          });
        }
      }

      logger.info(`Bulk registered ${results.successful.length} tokens, ${results.failed.length} failed`, 'FCM-TOKEN-SERVICE');
      return results;
    } catch (error) {
      logger.error(`Failed to bulk register tokens: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Get tokens for multiple users
   */
  async getBulkUserTokens(userIds) {
    try {
      const tokens = await FcmToken.getBulkTokens(userIds);
      
      // Group by user
      const groupedTokens = {};
      tokens.forEach(token => {
        if (!groupedTokens[token.userId]) {
          groupedTokens[token.userId] = [];
        }
        groupedTokens[token.userId].push(token);
      });
      
      return groupedTokens;
    } catch (error) {
      logger.error(`Failed to get bulk user tokens: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Handle token error from FCM
   */
  async handleTokenError(token, errorCode, errorMessage) {
    try {
      const fcmToken = await FcmToken.findByToken(token);
      
      if (!fcmToken) {
        logger.warn(`Token not found for error handling: ${token}`, 'FCM-TOKEN-SERVICE');
        return;
      }

      await fcmToken.addError(errorMessage, errorCode);
      
      // Handle specific error codes
      const criticalErrors = ['InvalidRegistration', 'NotRegistered', 'MismatchSenderId'];
      if (criticalErrors.includes(errorCode)) {
        await fcmToken.markAsStale();
        logger.warn(`Token ${fcmToken._id} marked as stale due to critical error: ${errorCode}`, 'FCM-TOKEN-SERVICE');
      }
      
      return fcmToken;
    } catch (error) {
      logger.error(`Failed to handle token error: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Update token activity in bulk
   */
  async updateBulkActivity(tokenIds) {
    try {
      const result = await FcmToken.updateBulkActivity(tokenIds);
      
      logger.info(`Updated activity for ${result.modifiedCount} tokens`, 'FCM-TOKEN-SERVICE');
      return result;
    } catch (error) {
      logger.error(`Failed to update bulk activity: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Get tokens by platform
   */
  async getTokensByPlatform(platform) {
    try {
      const tokens = await FcmToken.find({
        'deviceInfo.platform': platform,
        isActive: true,
        isStale: false
      });
      
      return tokens;
    } catch (error) {
      logger.error(`Failed to get tokens by platform: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }

  /**
   * Resolve token errors
   */
  async resolveTokenErrors(token) {
    try {
      const fcmToken = await FcmToken.findByToken(token);
      
      if (!fcmToken) {
        throw new Error('FCM token not found');
      }

      await fcmToken.resolveErrors();
      
      logger.info(`Resolved errors for token ${fcmToken._id}`, 'FCM-TOKEN-SERVICE');
      return fcmToken;
    } catch (error) {
      logger.error(`Failed to resolve token errors: ${error.message}`, 'FCM-TOKEN-SERVICE');
      throw error;
    }
  }
}

module.exports = new FcmTokenService();