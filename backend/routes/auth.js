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

router.post('/register',      authLimiter, ctrl.register);
router.post('/login',         authLimiter, ctrl.login);
router.post('/setup-profile', requireAuth, ctrl.setupProfile);  // called after client-side Supabase signup
router.get('/me',             requireAuth, ctrl.getMe);

module.exports = router;
