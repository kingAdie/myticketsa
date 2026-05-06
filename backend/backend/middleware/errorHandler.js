/**
 * middleware/errorHandler.js
 * Centralised Express error handler — must be registered LAST.
 */
'use strict';

const config = require('../config');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Log full stack in development, just the message in production
  if (!config.isProd) {
    console.error('[ERROR]', err.stack || err.message);
  } else {
    console.error('[ERROR]', req.method, req.path, err.message);
  }

  const status = err.status || err.statusCode || 500;

  return res.status(status).json({
    success: false,
    error:   config.isProd ? 'An unexpected error occurred.' : err.message,
    ...(config.isProd ? {} : { stack: err.stack }),
  });
}

module.exports = errorHandler;
