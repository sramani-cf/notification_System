const { AppError } = require('./errorHandler');


const validateObjectId = (req, res, next) => {
  const { id } = req.params;
  
  if (id && !id.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new AppError('Invalid ID format', 400));
  }
  
  next();
};

const validatePagination = (req, res, next) => {
  const { limit, skip } = req.query;
  
  if (limit) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return next(new AppError('Limit must be a number between 1 and 100', 400));
    }
  }
  
  if (skip) {
    const skipNum = parseInt(skip);
    if (isNaN(skipNum) || skipNum < 0) {
      return next(new AppError('Skip must be a non-negative number', 400));
    }
  }
  
  next();
};


const validateLogin = (req, res, next) => {
  const { userId, username, email, password, ipAddress, device } = req.body;
  
  if (!userId) {
    return next(new AppError('User ID is required', 400));
  }
  
  if (!username) {
    return next(new AppError('Username is required', 400));
  }
  
  if (!email) {
    return next(new AppError('Email is required', 400));
  }
  
  if (!password) {
    return next(new AppError('Password is required', 400));
  }
  
  if (!ipAddress) {
    return next(new AppError('IP address is required', 400));
  }
  
  if (!device) {
    return next(new AppError('Device information is required', 400));
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new AppError('Invalid email format', 400));
  }
  
  next();
};

const validateResetPassword = (req, res, next) => {
  const { userId, email, resetToken, expiresAt } = req.body;
  
  if (!userId) {
    return next(new AppError('User ID is required', 400));
  }
  
  if (!email) {
    return next(new AppError('Email is required', 400));
  }
  
  if (!resetToken) {
    return next(new AppError('Reset token is required', 400));
  }
  
  if (!expiresAt) {
    return next(new AppError('Token expiration date is required', 400));
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new AppError('Invalid email format', 400));
  }
  
  const expirationDate = new Date(expiresAt);
  if (isNaN(expirationDate.getTime())) {
    return next(new AppError('Invalid expiration date format', 400));
  }
  
  if (expirationDate <= new Date()) {
    return next(new AppError('Expiration date must be in the future', 400));
  }
  
  next();
};

const validatePurchase = (req, res, next) => {
  const { userId, orderId, amount, items, totalAmount } = req.body;
  
  if (!userId) {
    return next(new AppError('User ID is required', 400));
  }
  
  if (!orderId) {
    return next(new AppError('Order ID is required', 400));
  }
  
  if (amount === undefined || amount === null) {
    return next(new AppError('Amount is required', 400));
  }
  
  if (amount < 0) {
    return next(new AppError('Amount must be positive', 400));
  }
  
  if (!items || !Array.isArray(items)) {
    return next(new AppError('Items must be an array', 400));
  }
  
  if (items.length === 0) {
    return next(new AppError('At least one item is required', 400));
  }
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.name) {
      return next(new AppError(`Item ${i + 1}: name is required`, 400));
    }
    if (!item.quantity || item.quantity < 1) {
      return next(new AppError(`Item ${i + 1}: quantity must be at least 1`, 400));
    }
    if (item.price === undefined || item.price < 0) {
      return next(new AppError(`Item ${i + 1}: price must be non-negative`, 400));
    }
  }
  
  if (totalAmount !== undefined && totalAmount < 0) {
    return next(new AppError('Total amount must be positive', 400));
  }
  
  next();
};

const validateSessionToken = (req, res, next) => {
  const { sessionToken } = req.params;
  
  if (!sessionToken) {
    return next(new AppError('Session token is required', 400));
  }
  
  if (sessionToken.length < 10) {
    return next(new AppError('Invalid session token format', 400));
  }
  
  next();
};

const validateUserId = (req, res, next) => {
  const { userId } = req.params;
  
  if (!userId) {
    return next(new AppError('User ID is required', 400));
  }
  
  const userIdNum = parseInt(userId);
  if (isNaN(userIdNum) || userIdNum < 1) {
    return next(new AppError('Invalid user ID format', 400));
  }
  
  next();
};

const validateSignup = (req, res, next) => {
  const { userId, username, email, password } = req.body;
  
  if (!userId) {
    return next(new AppError('User ID is required', 400));
  }
  
  if (!username) {
    return next(new AppError('Username is required', 400));
  }
  
  if (!email) {
    return next(new AppError('Email is required', 400));
  }
  
  if (!password) {
    return next(new AppError('Password is required', 400));
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new AppError('Invalid email format', 400));
  }
  
  if (username.length < 3 || username.length > 50) {
    return next(new AppError('Username must be between 3 and 50 characters', 400));
  }
  
  if (password.length < 6) {
    return next(new AppError('Password must be at least 6 characters', 400));
  }
  
  next();
};

const validateFriendRequest = (req, res, next) => {
  const { fromUserId, fromUsername, toUserId, toUsername, message } = req.body;
  
  if (!fromUserId) {
    return next(new AppError('From User ID is required', 400));
  }
  
  if (!fromUsername) {
    return next(new AppError('From Username is required', 400));
  }
  
  if (!toUserId) {
    return next(new AppError('To User ID is required', 400));
  }
  
  if (!toUsername) {
    return next(new AppError('To Username is required', 400));
  }
  
  if (message && message.length > 500) {
    return next(new AppError('Message cannot exceed 500 characters', 400));
  }
  
  const fromUserIdNum = parseInt(fromUserId);
  const toUserIdNum = parseInt(toUserId);
  
  if (isNaN(fromUserIdNum) || fromUserIdNum < 1) {
    return next(new AppError('Invalid From User ID format', 400));
  }
  
  if (isNaN(toUserIdNum) || toUserIdNum < 1) {
    return next(new AppError('Invalid To User ID format', 400));
  }
  
  next();
};

module.exports = {
  validateObjectId,
  validatePagination,
  validateLogin,
  validateResetPassword,
  validatePurchase,
  validateSignup,
  validateFriendRequest,
  validateSessionToken,
  validateUserId
};