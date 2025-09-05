const FriendRequest = require('../models/friendRequests.model');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES } = require('../constants');
const logger = require('../utils/logger');

class FriendRequestController {
  async create(req, res, next) {
    try {
      logger.info(`Received POST /api/friend-requests with body: ${JSON.stringify(req.body)}`, req.serverInfo);
      
      const { fromUserId, toUserId } = req.body;
      
      // Check if users are trying to friend themselves
      if (fromUserId === toUserId) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Cannot send friend request to yourself'
        });
      }
      
      // Check for existing request
      const existingRequest = await FriendRequest.checkExistingRequest(fromUserId, toUserId);
      
      if (existingRequest) {
        let errorMessage = 'Friend request already exists';
        if (existingRequest.requestStatus === 'accepted') {
          errorMessage = 'Already friends with this user';
        } else if (existingRequest.requestStatus === 'pending') {
          errorMessage = 'Friend request already pending';
        }
        
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: errorMessage,
          existingRequest: {
            id: existingRequest._id,
            status: existingRequest.requestStatus
          }
        });
      }
      
      const friendRequestData = {
        ...req.body,
        assignedServer: req.serverInfo,
        processedBy: `${req.serverInfo}-${Date.now()}`
      };
      
      const friendRequest = new FriendRequest(friendRequestData);
      await friendRequest.save();
      
      logger.success(`Created friend request: ${friendRequest._id}`, req.serverInfo);

      // Send in-app notification to recipient (mirrors login notification pattern)
      try {
        logger.info(`Attempting to send friend request in-app notification to user: ${friendRequest.toUsername}`, req.serverInfo);
        
        // Mark notification as pending before queueing
        await friendRequest.updateFriendRequestInAppNotificationStatus('pending');
        
        const notificationResult = await notificationService.sendNotification(
          NOTIFICATION_TYPES.FRIEND_REQUEST,
          {
            userId: friendRequest.toUserId,
            username: friendRequest.toUsername,
            email: null, // Not needed for in-app only notifications
            fromUserId: friendRequest.fromUserId,
            fromUsername: friendRequest.fromUsername,
            message: friendRequest.message || 'sent you a friend request',
            friendRequestId: friendRequest._id.toString()
          },
          {
            serverInfo: req.serverInfo,
            friendRequestId: friendRequest._id.toString() // Pass friend request ID for tracking
          }
        );
        
        // Handle in-app notification result
        if (notificationResult.inapp && notificationResult.inapp.success) {
          await friendRequest.markFriendRequestInAppNotificationQueued(
            notificationResult.inapp.jobId,
            notificationResult.inapp.notificationId
          );
          logger.success(`Friend request in-app notification queued successfully for user: ${friendRequest.toUsername} (Job ID: ${notificationResult.inapp.jobId})`, req.serverInfo);
        } else {
          const reason = notificationResult.inapp?.reason || 'Unknown error during in-app notification queuing';
          await friendRequest.markFriendRequestInAppNotificationFailed(reason);
          logger.error(`Friend request in-app notification queuing failed for user: ${friendRequest.toUsername}. Reason: ${reason}`, req.serverInfo);
        }

        // Log overall notification result
        const inappSuccess = notificationResult.inapp?.success || false;
        if (inappSuccess) {
          logger.success(`Friend request notification processed for ${friendRequest.toUsername} - In-App: Success`, req.serverInfo);
        } else {
          logger.error(`Friend request notification failed for ${friendRequest.toUsername}`, req.serverInfo);
        }

      } catch (notificationError) {
        // Mark notification as failed if queueing fails
        const errorMessage = `Failed to queue: ${notificationError.message}`;
        await friendRequest.markFriendRequestInAppNotificationFailed(errorMessage);
        
        logger.error(`Exception while queueing friend request notification for ${friendRequest.toUsername}: ${notificationError.message}`, req.serverInfo);
        
        // Log the full error stack for debugging
        if (notificationError.stack) {
          logger.error(`Error stack: ${notificationError.stack}`, req.serverInfo);
        }
        
        // Check for specific error types
        if (notificationError.message.includes('not ready')) {
          logger.error('Notification service not ready - check Redis connection and configurations', req.serverInfo);
        } else if (notificationError.message.includes('not available')) {
          logger.error('Notification service not available - check service dependencies', req.serverInfo);
        } else if (notificationError.message.includes('Queue manager not initialized')) {
          logger.error('Queue manager not initialized - check Redis connection', req.serverInfo);
        }
      }
      
      res.status(201).json({
        success: true,
        server: req.serverInfo,
        data: friendRequest,
        message: 'Friend request sent successfully'
      });
    } catch (error) {
      logger.error(`Error creating friend request: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getAll(req, res, next) {
    try {
      const { 
        requestStatus, 
        fromUserId, 
        toUserId,
        limit = 20, 
        skip = 0, 
        sort = '-createdAt' 
      } = req.query;
      
      const query = {};
      
      if (requestStatus) {
        query.requestStatus = requestStatus;
      }
      
      if (fromUserId) {
        query.fromUserId = parseInt(fromUserId);
      }
      
      if (toUserId) {
        query.toUserId = parseInt(toUserId);
      }
      
      const friendRequests = await FriendRequest.find(query)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort(sort);
      
      const total = await FriendRequest.countDocuments(query);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: friendRequests,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching friend requests: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getById(req, res, next) {
    try {
      const friendRequest = await FriendRequest.findById(req.params.id);
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Friend request not found'
        });
      }
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: friendRequest
      });
    } catch (error) {
      logger.error(`Error fetching friend request: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getPending(req, res, next) {
    try {
      const { userId } = req.params;
      const pendingRequests = await FriendRequest.getPendingRequests(parseInt(userId));
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: pendingRequests,
        count: pendingRequests.length
      });
    } catch (error) {
      logger.error(`Error fetching pending requests: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getSent(req, res, next) {
    try {
      const { userId } = req.params;
      const sentRequests = await FriendRequest.getSentRequests(parseInt(userId));
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: sentRequests,
        count: sentRequests.length
      });
    } catch (error) {
      logger.error(`Error fetching sent requests: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getFriends(req, res, next) {
    try {
      const { userId } = req.params;
      const friends = await FriendRequest.getFriends(parseInt(userId));
      
      // Transform the data to show actual friends
      const friendsList = friends.map(request => {
        if (request.fromUserId === parseInt(userId)) {
          return {
            userId: request.toUserId,
            username: request.toUsername,
            friendshipDate: request.acceptedAt,
            relationshipType: request.relationshipType
          };
        } else {
          return {
            userId: request.fromUserId,
            username: request.fromUsername,
            friendshipDate: request.acceptedAt,
            relationshipType: request.relationshipType
          };
        }
      });
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: friendsList,
        count: friendsList.length
      });
    } catch (error) {
      logger.error(`Error fetching friends: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async accept(req, res, next) {
    try {
      const { id } = req.params;
      
      const friendRequest = await FriendRequest.findById(id);
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Friend request not found'
        });
      }
      
      if (friendRequest.requestStatus !== 'pending') {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: `Cannot accept request with status: ${friendRequest.requestStatus}`
        });
      }
      
      await friendRequest.accept();
      
      logger.success(`Friend request accepted: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: friendRequest,
        message: 'Friend request accepted successfully'
      });
    } catch (error) {
      logger.error(`Error accepting friend request: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async reject(req, res, next) {
    try {
      const { id } = req.params;
      
      const friendRequest = await FriendRequest.findById(id);
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Friend request not found'
        });
      }
      
      if (friendRequest.requestStatus !== 'pending') {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: `Cannot reject request with status: ${friendRequest.requestStatus}`
        });
      }
      
      await friendRequest.reject();
      
      logger.info(`Friend request rejected: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: friendRequest,
        message: 'Friend request rejected'
      });
    } catch (error) {
      logger.error(`Error rejecting friend request: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async cancel(req, res, next) {
    try {
      const { id } = req.params;
      
      const friendRequest = await FriendRequest.findById(id);
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Friend request not found'
        });
      }
      
      if (friendRequest.requestStatus !== 'pending') {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: `Cannot cancel request with status: ${friendRequest.requestStatus}`
        });
      }
      
      await friendRequest.cancel();
      
      logger.info(`Friend request cancelled: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: friendRequest,
        message: 'Friend request cancelled'
      });
    } catch (error) {
      logger.error(`Error cancelling friend request: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async block(req, res, next) {
    try {
      const { id } = req.params;
      
      const friendRequest = await FriendRequest.findById(id);
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Friend request not found'
        });
      }
      
      await friendRequest.block();
      
      logger.warn(`Friend request blocked: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: friendRequest,
        message: 'User blocked successfully'
      });
    } catch (error) {
      logger.error(`Error blocking friend request: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  
  async checkExisting(req, res, next) {
    try {
      const { fromUserId, toUserId } = req.query;
      
      if (!fromUserId || !toUserId) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Both fromUserId and toUserId are required'
        });
      }
      
      const existingRequest = await FriendRequest.checkExistingRequest(
        parseInt(fromUserId), 
        parseInt(toUserId)
      );
      
      res.json({
        success: true,
        server: req.serverInfo,
        exists: !!existingRequest,
        data: existingRequest
      });
    } catch (error) {
      logger.error(`Error checking existing request: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getStatistics(req, res, next) {
    try {
      const stats = await FriendRequest.getFriendRequestStatistics();
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: stats
      });
    } catch (error) {
      logger.error(`Error fetching statistics: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getFailedNotifications(req, res, next) {
    try {
      const failedNotifications = await FriendRequest.getFailedFriendRequestInAppNotifications();
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: failedNotifications,
        count: failedNotifications.length
      });
    } catch (error) {
      logger.error(`Error fetching failed friend request notifications: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  async getPendingNotifications(req, res, next) {
    try {
      const pendingNotifications = await FriendRequest.getPendingFriendRequestInAppNotifications();
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: pendingNotifications,
        count: pendingNotifications.length
      });
    } catch (error) {
      logger.error(`Error fetching pending friend request notifications: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async cleanupExpired(req, res, next) {
    try {
      const result = await FriendRequest.cleanupExpiredRequests();
      
      logger.info(`Cleaned up ${result.modifiedCount} expired friend requests`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        cleanedUp: result.modifiedCount,
        message: `Cleaned up ${result.modifiedCount} expired friend requests`
      });
    } catch (error) {
      logger.error(`Error cleaning up expired requests: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async updateRelationshipType(req, res, next) {
    try {
      const { id } = req.params;
      const { relationshipType } = req.body;
      
      const validTypes = ['friend', 'close_friend', 'family', 'colleague', 'acquaintance'];
      if (!validTypes.includes(relationshipType)) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: `Invalid relationship type. Must be one of: ${validTypes.join(', ')}`
        });
      }
      
      const friendRequest = await FriendRequest.findByIdAndUpdate(
        id,
        { relationshipType },
        { new: true, runValidators: true }
      );
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Friend request not found'
        });
      }
      
      logger.info(`Updated relationship type for friend request: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: friendRequest,
        message: 'Relationship type updated successfully'
      });
    } catch (error) {
      logger.error(`Error updating relationship type: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      
      const friendRequest = await FriendRequest.findByIdAndDelete(id);
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Friend request not found'
        });
      }
      
      logger.success(`Deleted friend request: ${id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        message: 'Friend request deleted successfully'
      });
    } catch (error) {
      logger.error(`Error deleting friend request: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
}

module.exports = new FriendRequestController();