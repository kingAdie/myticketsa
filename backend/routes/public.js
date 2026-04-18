/**
 * routes/public.js
 * Unauthenticated routes — events listing and detail.
 * Token is attached if present (optionalAuth) for role-based filtering.
 */
'use strict';

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/eventsController');
const { optionalAuth } = require('../middleware/auth');

router.get('/',    optionalAuth, ctrl.listEvents);
router.get('/:id', optionalAuth, ctrl.getEvent);

module.exports = router;
