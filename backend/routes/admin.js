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

// ── Organisers list ───────────────────────────────────────────────────────────
router.get('/organisers', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      "SELECT id, first_name, last_name, email, organisation_name, created_at FROM users WHERE role = 'organiser' ORDER BY created_at DESC"
    );
    const [evtRows] = await db.query(
      "SELECT organiser_id, COUNT(*) as total, SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) as published FROM events GROUP BY organiser_id"
    );
    const orgMap = {};
    evtRows.forEach(r => { orgMap[r.organiser_id] = { total: r.total, published: r.published }; });
    const organisers = rows.map(r => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
      email: r.email,
      org: r.organisation_name || '—',
      joined: r.created_at,
      events: orgMap[r.id] || { total: 0, published: 0 },
    }));
    return res.json({ success: true, organisers });
  } catch (err) { next(err); }
});

// ── Customers list ────────────────────────────────────────────────────────────
router.get('/customers', async (req, res, next) => {
  try {
    const [rows] = await db.query(
      "SELECT id, first_name, last_name, email, created_at FROM users WHERE role = 'attendee' ORDER BY created_at DESC"
    );
    const [tkts] = await db.query(
      "SELECT buyer_user_id, buyer_email, COUNT(*) as bookings, SUM(total) as spent FROM tickets WHERE status='confirmed' GROUP BY buyer_email"
    );
    const tktMap = {};
    tkts.forEach(t => { tktMap[t.buyer_email] = { bookings: t.bookings, spent: parseFloat(t.spent || 0) }; });
    const customers = rows.map(r => ({
      id: r.id,
      name: `${r.first_name} ${r.last_name}`,
      email: r.email,
      joined: r.created_at,
      bookings: tktMap[r.email]?.bookings || 0,
      spent: tktMap[r.email]?.spent || 0,
    }));
    return res.json({ success: true, customers });
  } catch (err) { next(err); }
});

// ── Media (uploaded images) ───────────────────────────────────────────────────
router.get('/media', async (req, res, next) => {
  try {
    const uploadsDir = require('path').resolve(__dirname, '../uploads');
    const fsSync = require('fs');
    if (!fsSync.existsSync(uploadsDir)) return res.json({ success: true, files: [] });
    const files = fsSync.readdirSync(uploadsDir)
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .map(f => ({
        filename: f,
        url: `/uploads/${f}`,
        size: fsSync.statSync(require('path').join(uploadsDir, f)).size,
        created: fsSync.statSync(require('path').join(uploadsDir, f)).mtime,
      }))
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    return res.json({ success: true, files });
  } catch (err) { next(err); }
});

// ── Simulate "Enhance Image" ──────────────────────────────────────────────────
router.post('/events/:id/enhance', async (req, res, next) => {
  try {
    const event = await require('../controllers/eventsController').getEventRaw(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });
    // Simulation: return same URL with a timestamp param to "bust" cache
    const enhanced = event.image ? `${event.image}${event.image.includes('?') ? '&' : '?'}enhanced=1&t=${Date.now()}` : null;
    return res.json({ success: true, message: 'Image enhanced (simulated)', url: enhanced || event.image });
  } catch (err) { next(err); }
});

module.exports = router;
