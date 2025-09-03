const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      if (!config.email.user || !config.email.password) {
        logger.warn('Email credentials not configured. Email service will be disabled.', 'EMAIL-SERVICE');
        return false;
      }

      this.transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: {
          user: config.email.user,
          pass: config.email.password
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateLimit: 5 // 5 emails per second max
      });

      // Verify SMTP connection
      await this.transporter.verify();
      this.isInitialized = true;
      logger.success('Email service initialized successfully', 'EMAIL-SERVICE');
      return true;
    } catch (error) {
      logger.error(`Failed to initialize email service: ${error.message}`, 'EMAIL-SERVICE');
      this.isInitialized = false;
      return false;
    }
  }

  async sendEmail({ to, subject, html, text }) {
    if (!this.isInitialized) {
      throw new Error('Email service not initialized');
    }

    if (!to || !subject || !html) {
      throw new Error('Missing required email parameters: to, subject, html');
    }

    const mailOptions = {
      from: config.email.from,
      to,
      subject,
      html,
      text: text || this.stripHtml(html)
    };

    try {
      logger.info(`Sending email to ${to} with subject: ${subject}`, 'EMAIL-SERVICE');
      const info = await this.transporter.sendMail(mailOptions);
      logger.success(`Email sent successfully to ${to}. MessageId: ${info.messageId}`, 'EMAIL-SERVICE');
      
      return {
        success: true,
        messageId: info.messageId,
        response: info.response
      };
    } catch (error) {
      logger.error(`Failed to send email to ${to}: ${error.message}`, 'EMAIL-SERVICE');
      throw error;
    }
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  async testConnection() {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      if (this.transporter) {
        await this.transporter.verify();
        return { success: true, message: 'SMTP connection successful' };
      }
      
      return { success: false, message: 'Email service not initialized' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async sendSignupEmail(userData) {
    const { email, username, firstName, lastName } = userData;
    const displayName = firstName && lastName ? `${firstName} ${lastName}` : username;
    
    const subject = 'Welcome to Notification System!';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
            .header { text-align: center; color: #333; margin-bottom: 30px; }
            .content { color: #555; line-height: 1.6; }
            .highlight { color: #007bff; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Notification System!</h1>
            </div>
            <div class="content">
              <p>Hello <span class="highlight">${displayName}</span>,</p>
              <p>Thank you for signing up for our Notification System! Your account has been successfully created.</p>
              <p><strong>Account Details:</strong></p>
              <ul>
                <li>Username: ${username}</li>
                <li>Email: ${email}</li>
                <li>Registration Date: ${new Date().toLocaleDateString()}</li>
              </ul>
              <p>You can now start using all the features of our platform.</p>
              <p>If you have any questions, feel free to contact our support team.</p>
            </div>
            <div class="footer">
              <p>This email was sent from the Notification System.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({ to: email, subject, html });
  }

  async sendLoginAlertEmail(userData) {
    const { email, username, loginTime, ipAddress, userAgent } = userData;
    
    const subject = 'New Login Alert - Notification System';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
            .header { text-align: center; color: #333; margin-bottom: 30px; }
            .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
            .content { color: #555; line-height: 1.6; }
            .highlight { color: #007bff; font-weight: bold; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Login Alert</h1>
            </div>
            <div class="alert">
              <strong>Security Notice:</strong> A new login was detected on your account.
            </div>
            <div class="content">
              <p>Hello <span class="highlight">${username}</span>,</p>
              <p>We detected a new login to your Notification System account:</p>
              <p><strong>Login Details:</strong></p>
              <ul>
                <li>Time: ${loginTime ? new Date(loginTime).toLocaleString() : new Date().toLocaleString()}</li>
                <li>IP Address: ${ipAddress || 'Unknown'}</li>
                <li>Device: ${userAgent || 'Unknown'}</li>
              </ul>
              <p>If this was you, no action is needed. If you don't recognize this login, please contact our support team immediately.</p>
            </div>
            <div class="footer">
              <p>This email was sent from the Notification System for security purposes.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({ to: email, subject, html });
  }

  async sendPasswordResetEmail(userData) {
    const { email, username, resetToken, resetUrl } = userData;
    
    const subject = 'Password Reset Request - Notification System';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; }
            .header { text-align: center; color: #333; margin-bottom: 30px; }
            .content { color: #555; line-height: 1.6; }
            .highlight { color: #007bff; font-weight: bold; }
            .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .warning { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 20px 0; color: #721c24; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔑 Password Reset</h1>
            </div>
            <div class="content">
              <p>Hello <span class="highlight">${username}</span>,</p>
              <p>We received a request to reset the password for your Notification System account.</p>
              ${resetUrl ? `
                <p>Click the button below to reset your password:</p>
                <div style="text-align: center;">
                  <a href="${resetUrl}" class="button">Reset Password</a>
                </div>
                <p>Or copy and paste this link in your browser:</p>
                <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 4px;">${resetUrl}</p>
              ` : resetToken ? `
                <p>Use the following 6-digit reset code:</p>
                <div style="text-align: center; margin: 20px 0;">
                  <div style="display: inline-block; background: #f8f9fa; border: 2px dashed #007bff; padding: 20px 30px; border-radius: 8px;">
                    <span style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #007bff;">${resetToken}</span>
                  </div>
                </div>
                <p style="text-align: center; color: #666; font-size: 14px;">Enter this code on the password reset page</p>
              ` : ''}
              <div class="warning">
                <strong>Security Note:</strong> This reset ${resetUrl ? 'link' : 'code'} will expire in 1 hour. If you didn't request this password reset, please ignore this email.
              </div>
              <p>If you continue to have problems, please contact our support team.</p>
            </div>
            <div class="footer">
              <p>This email was sent from the Notification System.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await this.sendEmail({ to: email, subject, html });
  }

  async closeConnections() {
    if (this.transporter) {
      this.transporter.close();
      logger.info('Email service connections closed', 'EMAIL-SERVICE');
    }
  }
}

module.exports = new EmailService();