const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    userId: req.user?.id,
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: 'Validation Error', errors: err.details });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({ success: false, message });
};

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

module.exports = errorHandler;
module.exports.AppError = AppError;
