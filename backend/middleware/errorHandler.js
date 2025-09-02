const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  logger.error(`Error: ${err.message}`, req.serverInfo || 'UNKNOWN');

  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new AppError(message, 404);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate field value: ${field}. Please use another value!`;
    error = new AppError(message, 400);
  }

  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    const message = `Invalid input data. ${errors.join('. ')}`;
    error = new AppError(message, 400);
  }

  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please log in again!';
    error = new AppError(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Your token has expired! Please log in again.';
    error = new AppError(message, 401);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    server: req.serverInfo || 'UNKNOWN',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

const notFound = (req, res, next) => {
  const message = `Route ${req.originalUrl} not found`;
  const error = new AppError(message, 404);
  next(error);
};

const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFound,
  asyncHandler,
  AppError
};