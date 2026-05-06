/**
 * routes/organiser.js
 * All routes require an authenticated user (any role).
 * Event create/update/delete and service requests live here.
 */
'use strict';

const express = require('express');
const router  = express.Router();
const eventsCtrl  = require('../controllers/eventsController');
const requestCtrl = require('../controllers/serviceRequestController');
const { requireAuth, requireOrganiser } = require('../middleware/auth');

// ── All organiser routes require auth ─────────────────────────────────────────
router.use(requireAuth);

// ── Events ────────────────────────────────────────────────────────────────────
router.get('/events',          requireOrganiser, eventsCtrl.listEvents);      // own events only (filtered in controller)
router.post('/events',         eventsCtrl.createEvent);               // any logged-in user may submit
router.put('/events/:id',      requireOrganiser, eventsCtrl.updateEvent);
router.delete('/events/:id',   requireOrganiser, eventsCtrl.deleteEvent);

// ── Service / Equipment requests ──────────────────────────────────────────────
router.post('/requests',       requestCtrl.createRequest);
router.get('/requests',        requestCtrl.listMyRequests);
router.get('/requests/:id',    requestCtrl.getRequest);

module.exports = router;
