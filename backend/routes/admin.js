/**
 * routes/admin.js
 * All routes require auth + admin role.
 */
'use strict';

const express     = require('express');
const router      = express.Router();
const eventsCtrl  = require('../controllers/eventsController');
const requestCtrl = require('../controllers/serviceRequestController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../services/db');

router.use(requireAuth, requireAdmin);

// ── Dashboard stats ───────────────────────────────────────────────────────────
router.get('/stats', eventsCtrl.getStats);

// ── User management ───────────────────────────────────────────────────────────
router.get('/users',              eventsCtrl.listUsers);
router.put('/users/:id/role',     eventsCtrl.updateUserRole);

// ── Event moderation ──────────────────────────────────────────────────────────
router.put('/events/:id/status',  eventsCtrl.updateEventStatus);

// ── Sold tickets ──────────────────────────────────────────────────────────────
router.get('/tickets', async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM tickets ORDER BY booked_at DESC');
    const tickets = rows.map(t => ({
      id: t.id, status: t.status,
      buyer: { firstName: t.buyer_first_name, lastName: t.buyer_last_name, email: t.buyer_email },
      event: { id: t.event_id, title: t.event_title, date: t.event_date, city: t.event_city },
      ticket: { typeName: t.ticket_type_name, quantity: t.quantity },
      pricing: { total: parseFloat(t.total) },
      payment: { reference: t.payment_reference, method: t.payment_method },
      qrCodeUrl: t.qr_code_url,
      bookedAt: t.booked_at,
    }));
    return res.json({ success: true, tickets, total: tickets.length });
  } catch (err) { next(err); }
});

// ── Service / Equipment requests ──────────────────────────────────────────────
router.get('/requests',                  requestCtrl.listAllRequests);
router.put('/requests/:id/status',       requestCtrl.updateRequestStatus);

module.exports = router;
