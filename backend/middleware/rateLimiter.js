/**
 * middleware/rateLimiter.js
 * Per-route rate limiting to prevent brute-force attacks.
 */
'use strict';

const rateLimit = require('express-rate-limit');

/**
 * authLimiter strict limit on login / register endpoints.
 * 10 attempts per IP per 15 minutes, then locked for 15 min.
 */
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000, // 15 minutes
  max:              10,
  standardHeaders:  true,
  legacyHeaders:    false,
  message: {
    success: false,
    error:   'Too many attempts from this IP. Please try again in 15 minutes.',
    code:    'RATE_LIMITED',
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

/**
 * apiLimiter general API limit to prevent scraping / abuse.
 * 200 requests per IP per minute.
 */
const apiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    error:   'Too many requests. Please slow down.',
    code:    'RATE_LIMITED',
  },
  skip: (req) => process.env.NODE_ENV === 'test',
});

module.exports = { authLimiter, apiLimiter };
