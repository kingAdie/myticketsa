'use strict';

const express     = require('express');
const router      = express.Router();
const eventsCtrl  = require('../controllers/eventsController');
const requestCtrl = require('../controllers/serviceRequestController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { supabaseAdmin } = require('../services/supabase');

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
    const { data, error } = await supabaseAdmin
      .from('tickets')
      .select('*')
      .order('booked_at', { ascending: false });
    if (error) throw error;
    const tickets = (data || []).map(t => ({
      id:       t.id,
      status:   t.status,
      buyer:    { firstName: t.buyer_first_name, lastName: t.buyer_last_name, email: t.buyer_email },
      event:    { id: t.event_id, title: t.event_title, date: t.event_date, city: t.event_city },
      ticket:   { typeName: t.ticket_type_name, quantity: t.quantity },
      pricing:  { total: parseFloat(t.total) },
      payment:  { reference: t.payment_reference, method: t.payment_method },
      qrCodeUrl: t.qr_code_url,
      bookedAt: t.booked_at,
    }));
    return res.json({ success: true, tickets, total: tickets.length });
  } catch (err) { next(err); }
});

// ── Service / Equipment requests ──────────────────────────────────────────────
router.get('/requests',                 requestCtrl.listAllRequests);
router.put('/requests/:id/status',      requestCtrl.updateRequestStatus);

// ── Organisers list ───────────────────────────────────────────────────────────
router.get('/organisers', async (req, res, next) => {
  try {
    const { data: organisers, error: orgErr } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, email, organisation_name, created_at')
      .eq('role', 'organiser')
      .order('created_at', { ascending: false });
    if (orgErr) throw orgErr;

    const { data: evtData, error: evtErr } = await supabaseAdmin
      .from('events')
      .select('organiser_id, status');
    if (evtErr) throw evtErr;

    const orgMap = {};
    (evtData || []).forEach(e => {
      if (!orgMap[e.organiser_id]) orgMap[e.organiser_id] = { total: 0, published: 0 };
      orgMap[e.organiser_id].total++;
      if (e.status === 'published') orgMap[e.organiser_id].published++;
    });

    return res.json({
      success: true,
      organisers: (organisers || []).map(r => ({
        id:     r.id,
        name:   `${r.first_name} ${r.last_name}`,
        email:  r.email,
        org:    r.organisation_name || '—',
        joined: r.created_at,
        events: orgMap[r.id] || { total: 0, published: 0 },
      })),
    });
  } catch (err) { next(err); }
});

// ── Customers list ────────────────────────────────────────────────────────────
router.get('/customers', async (req, res, next) => {
  try {
    const { data: customers, error: custErr } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, email, created_at')
      .eq('role', 'attendee')
      .order('created_at', { ascending: false });
    if (custErr) throw custErr;

    const { data: tkts, error: tktErr } = await supabaseAdmin
      .from('tickets')
      .select('buyer_email, quantity, total')
      .eq('status', 'confirmed');
    if (tktErr) throw tktErr;

    const tktMap = {};
    (tkts || []).forEach(t => {
      if (!tktMap[t.buyer_email]) tktMap[t.buyer_email] = { bookings: 0, spent: 0 };
      tktMap[t.buyer_email].bookings++;
      tktMap[t.buyer_email].spent += parseFloat(t.total || 0);
    });

    return res.json({
      success: true,
      customers: (customers || []).map(r => ({
        id:       r.id,
        name:     `${r.first_name} ${r.last_name}`,
        email:    r.email,
        joined:   r.created_at,
        bookings: tktMap[r.email]?.bookings || 0,
        spent:    tktMap[r.email]?.spent    || 0,
      })),
    });
  } catch (err) { next(err); }
});

// ── Media (uploaded images) ───────────────────────────────────────────────────
router.get('/media', async (req, res, next) => {
  try {
    const uploadsDir = require('path').resolve(__dirname, '../uploads');
    const fsSync     = require('fs');
    if (!fsSync.existsSync(uploadsDir)) return res.json({ success: true, files: [] });
    const files = fsSync.readdirSync(uploadsDir)
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .map(f => ({
        filename: f,
        url:      `/uploads/${f}`,
        size:     fsSync.statSync(require('path').join(uploadsDir, f)).size,
        created:  fsSync.statSync(require('path').join(uploadsDir, f)).mtime,
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
    const enhanced = event.image
      ? `${event.image}${event.image.includes('?') ? '&' : '?'}enhanced=1&t=${Date.now()}`
      : null;
    return res.json({ success: true, message: 'Image enhanced (simulated)', url: enhanced || event.image });
  } catch (err) { next(err); }
});

module.exports = router;
