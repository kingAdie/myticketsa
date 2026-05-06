/**
 * routes/auth.js
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me        (requires valid token)
 */
'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/authController');
const { requireAuth }              = require('../middleware/auth');
const { authLimiter }              = require('../middleware/rateLimiter');

router.post('/register', authLimiter, ctrl.register);
router.post('/login',    authLimiter, ctrl.login);
router.get('/me',        requireAuth, ctrl.getMe);   // ← used by frontend to validate token on load

module.exports = router;
