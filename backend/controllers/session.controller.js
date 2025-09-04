const crypto = require('crypto');

// In-memory session storage (in production, use Redis or database)
const sessions = new Map();

class SessionController {
  // Create or retrieve session
  async createSession(req, res) {
    try {
      const { clientInfo } = req.body;
      
      // Generate session data
      const userId = Math.floor(10000 + Math.random() * 90000); // 5-digit user ID
      const username = `user_${userId}`;
      const email = 'ramanisahil.cf@gmail.com'; // Test email
      const sessionToken = crypto.randomBytes(32).toString('hex');
      
      const sessionData = {
        userId,
        username,
        email,
        sessionToken,
        clientInfo,
        createdAt: new Date().toISOString(),
        lastAccess: new Date().toISOString()
      };
      
      // Store session
      sessions.set(sessionToken, sessionData);
      
      // Also store by userId for quick lookup
      sessions.set(`user_${userId}`, sessionData);
      
      console.log(`[SESSION] Created new session for user ${userId} (${username})`);
      
      res.status(201).json({
        success: true,
        ...sessionData
      });
    } catch (error) {
      console.error('[SESSION] Error creating session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create session',
        error: error.message
      });
    }
  }
  
  // Get session by token
  async getSession(req, res) {
    try {
      const { sessionToken } = req.params;
      
      const session = sessions.get(sessionToken);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }
      
      // Update last access
      session.lastAccess = new Date().toISOString();
      sessions.set(sessionToken, session);
      
      res.json({
        success: true,
        ...session
      });
    } catch (error) {
      console.error('[SESSION] Error getting session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get session',
        error: error.message
      });
    }
  }
  
  // Validate session
  async validateSession(req, res) {
    try {
      const { sessionToken, userId } = req.body;
      
      const session = sessions.get(sessionToken) || sessions.get(`user_${userId}`);
      
      if (!session) {
        return res.status(401).json({
          success: false,
          valid: false,
          message: 'Invalid session'
        });
      }
      
      // Update last access
      session.lastAccess = new Date().toISOString();
      
      res.json({
        success: true,
        valid: true,
        session: {
          userId: session.userId,
          username: session.username,
          email: session.email
        }
      });
    } catch (error) {
      console.error('[SESSION] Error validating session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate session',
        error: error.message
      });
    }
  }
  
  // Clean up old sessions (could be run periodically)
  cleanupSessions() {
    const now = Date.now();
    const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [key, session] of sessions.entries()) {
      const lastAccess = new Date(session.lastAccess).getTime();
      if (now - lastAccess > sessionTimeout) {
        sessions.delete(key);
        console.log(`[SESSION] Cleaned up expired session for user ${session.userId}`);
      }
    }
  }
  
  // Get all active sessions (for debugging)
  async getActiveSessions(req, res) {
    try {
      const activeSessions = [];
      
      for (const [key, session] of sessions.entries()) {
        if (!key.startsWith('user_')) {
          activeSessions.push({
            userId: session.userId,
            username: session.username,
            createdAt: session.createdAt,
            lastAccess: session.lastAccess
          });
        }
      }
      
      res.json({
        success: true,
        count: activeSessions.length,
        sessions: activeSessions
      });
    } catch (error) {
      console.error('[SESSION] Error getting active sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get active sessions',
        error: error.message
      });
    }
  }
}

module.exports = new SessionController();