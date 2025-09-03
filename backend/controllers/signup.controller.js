const Signup = require('../models/signups.model');
const notificationService = require('../services/notificationService');
const { NOTIFICATION_TYPES } = require('../constants');
const logger = require('../utils/logger');

class SignupController {
  async create(req, res, next) {
    try {
      logger.info(`Received POST /api/signups with body: ${JSON.stringify(req.body)}`, req.serverInfo);
      
      const signupData = {
        ...req.body,
        assignedServer: req.serverInfo,
        processedBy: `${req.serverInfo}-${Date.now()}`
      };
      
      // Check if user already exists
      const existingUser = await Signup.findOne({
        $or: [
          { email: signupData.email },
          { username: signupData.username },
          { userId: signupData.userId }
        ]
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'User already exists with this email, username, or userId'
        });
      }
      
      const signup = new Signup(signupData);
      await signup.save();
      
      logger.success(`Created signup record: ${signup._id}`, req.serverInfo);

      // Send welcome email notification (fanout architecture)
      try {
        // Mark email as pending before queueing
        await signup.updateWelcomeEmailStatus('pending');
        
        const emailResult = await notificationService.sendNotification(
          NOTIFICATION_TYPES.SIGNUP,
          {
            email: signupData.email,
            username: signupData.username,
            firstName: signupData.firstName,
            lastName: signupData.lastName,
            userId: signupData.userId,
            signupId: signup._id.toString() // Pass signup ID for tracking
          },
          {
            serverInfo: req.serverInfo
          }
        );
        
        // Update signup record with queue information
        await signup.markWelcomeEmailQueued(emailResult.jobId, emailResult.notificationId);
        
        logger.info(`Welcome email queued for user: ${signup.username} (Job ID: ${emailResult.jobId})`, req.serverInfo);
      } catch (emailError) {
        // Mark email as failed if queueing fails
        await signup.markWelcomeEmailFailed(`Failed to queue: ${emailError.message}`);
        logger.error(`Failed to queue welcome email for ${signup.username}: ${emailError.message}`, req.serverInfo);
      }
      
      res.status(201).json({
        success: true,
        server: req.serverInfo,
        data: signup,
        message: 'Signup record created successfully'
      });
    } catch (error) {
      logger.error(`Error creating signup: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getAll(req, res, next) {
    try {
      const { emailVerified, limit = 20, skip = 0, sort = '-createdAt' } = req.query;
      const query = {};
      
      if (emailVerified !== undefined) {
        query.emailVerified = emailVerified === 'true';
      }
      
      const signups = await Signup.find(query)
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .sort(sort);
      
      const total = await Signup.countDocuments(query);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: signups,
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching signups: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getById(req, res, next) {
    try {
      const signup = await Signup.findById(req.params.id);
      
      if (!signup) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Signup record not found'
        });
      }
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: signup
      });
    } catch (error) {
      logger.error(`Error fetching signup: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getByUserId(req, res, next) {
    try {
      const signup = await Signup.findOne({ userId: req.params.userId });
      
      if (!signup) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Signup record not found for this user'
        });
      }
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: signup
      });
    } catch (error) {
      logger.error(`Error fetching signup by userId: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async update(req, res, next) {
    try {
      const signup = await Signup.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      
      if (!signup) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Signup record not found'
        });
      }
      
      logger.info(`Updated signup record: ${req.params.id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: signup,
        message: 'Signup record updated successfully'
      });
    } catch (error) {
      logger.error(`Error updating signup: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async verifyEmail(req, res, next) {
    try {
      const { token } = req.params;
      
      const signup = await Signup.findOne({ verificationToken: token });
      
      if (!signup) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Invalid verification token'
        });
      }
      
      if (signup.emailVerified) {
        return res.status(400).json({
          success: false,
          server: req.serverInfo,
          error: 'Email already verified'
        });
      }
      
      signup.emailVerified = true;
      signup.accountCreated = true;
      await signup.save();
      
      logger.success(`Email verified for user: ${signup.userId}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        message: 'Email verified successfully',
        data: signup
      });
    } catch (error) {
      logger.error(`Error verifying email: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async delete(req, res, next) {
    try {
      const signup = await Signup.findByIdAndDelete(req.params.id);
      
      if (!signup) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Signup record not found'
        });
      }
      
      logger.success(`Deleted signup record: ${req.params.id}`, req.serverInfo);
      
      res.json({
        success: true,
        server: req.serverInfo,
        message: 'Signup record deleted successfully'
      });
    } catch (error) {
      logger.error(`Error deleting signup: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getStatistics(req, res, next) {
    try {
      const stats = await Signup.getSignupStatistics();
      
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

  async getWelcomeEmailStatus(req, res, next) {
    try {
      const { id } = req.params;
      const signup = await Signup.findById(id);
      
      if (!signup) {
        return res.status(404).json({
          success: false,
          server: req.serverInfo,
          error: 'Signup record not found'
        });
      }

      const emailSummary = signup.getWelcomeEmailSummary();
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: {
          signupId: signup._id,
          username: signup.username,
          email: signup.email,
          welcomeEmail: emailSummary,
          fullHistory: signup.welcomeEmail?.deliveryHistory || []
        }
      });
    } catch (error) {
      logger.error(`Error fetching welcome email status: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  async getFailedWelcomeEmails(req, res, next) {
    try {
      const { limit = 20, skip = 0 } = req.query;
      
      const failedEmails = await Signup.getFailedWelcomeEmails()
        .limit(parseInt(limit))
        .skip(parseInt(skip));
      
      const total = await Signup.countDocuments({ 'welcomeEmail.status': 'failed' });
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: failedEmails.map(signup => ({
          signupId: signup._id,
          username: signup.username,
          email: signup.email,
          createdAt: signup.createdAt,
          welcomeEmail: signup.getWelcomeEmailSummary()
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching failed welcome emails: ${error.message}`, req.serverInfo);
      next(error);
    }
  }

  async getPendingWelcomeEmails(req, res, next) {
    try {
      const { limit = 20, skip = 0 } = req.query;
      
      const pendingEmails = await Signup.getPendingWelcomeEmails()
        .limit(parseInt(limit))
        .skip(parseInt(skip));
      
      const total = await Signup.countDocuments({ 
        'welcomeEmail.status': { $in: ['pending', 'queued', 'sending'] } 
      });
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: pendingEmails.map(signup => ({
          signupId: signup._id,
          username: signup.username,
          email: signup.email,
          createdAt: signup.createdAt,
          welcomeEmail: signup.getWelcomeEmailSummary()
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      logger.error(`Error fetching pending welcome emails: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
  
  async getUnverified(req, res, next) {
    try {
      const { days = 7 } = req.query;
      const unverified = await Signup.findUnverifiedAccounts(parseInt(days));
      
      res.json({
        success: true,
        server: req.serverInfo,
        data: unverified,
        count: unverified.length,
        daysOld: parseInt(days)
      });
    } catch (error) {
      logger.error(`Error fetching unverified accounts: ${error.message}`, req.serverInfo);
      next(error);
    }
  }
}

module.exports = new SignupController();