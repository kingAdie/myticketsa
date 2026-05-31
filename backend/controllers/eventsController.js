/**
 * controllers/eventsController.js
 *
 * Public:     GET  /api/events          - list published events
 *             GET  /api/events/:id      - get single event
 * Organiser:  POST /api/events          - create event
 *             PUT  /api/events/:id      - update own event
 *             DELETE /api/events/:id    - delete own event
 * Admin:      PUT  /api/events/:id/status - approve/reject/feature
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const dataStore = require('../services/dataStore');

// ── Public: list events ───────────────────────────────────────────────────────

async function listEvents(req, res, next) {
  try {
    const { category, featured, search, status } = req.query;

    let events = await dataStore.getEvents();

    // Admins and organisers can see all statuses; public only sees published
    const isPrivileged = req.user && ['admin', 'organiser'].includes(req.user.role);
    if (!isPrivileged) {
      events = events.filter(e => e.status === 'published');
    } else if (status) {
      events = events.filter(e => e.status === status);
    }

    // Organisers only see their own events unless admin
    if (req.user?.role === 'organiser') {
      events = events.filter(e => e.organiserId === req.user.id);
    }

    if (category)            events = events.filter(e => e.category.toLowerCase() === category.toLowerCase());
    if (featured === 'true') events = events.filter(e => e.featured);
    if (search) {
      const q = search.toLowerCase();
      events = events.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q)  ||
        e.category.toLowerCase().includes(q)
      );
    }

    // Sort: featured first, then by date
    events.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return new Date(a.date) - new Date(b.date);
    });

    return res.json({ success: true, events, total: events.length });
  } catch (err) {
    next(err);
  }
}

// ── Public: get single event ──────────────────────────────────────────────────

async function getEvent(req, res, next) {
  try {
    const event = await dataStore.getEventById(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });

    // Non-admin/organiser can only see published events
    const isPrivileged = req.user && ['admin', 'organiser'].includes(req.user.role);
    if (!isPrivileged && event.status !== 'published') {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    return res.json({ success: true, event });
  } catch (err) {
    next(err);
  }
}

// ── Organiser/Admin: create event ─────────────────────────────────────────────

async function createEvent(req, res, next) {
  try {
    const errors = validateEventInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const {
      title, category, date, time, endTime,
      location, city, province,
      description, image, price,
      ticketTypes, tags,
      address, paymentType, paymentLink, bankName, accountHolder, accountNumber, branchCode,
    } = req.body;

    const isAdmin = req.user.role === 'admin';

    const event = {
      id:           `EVT-${uuidv4().slice(0, 8).toUpperCase()}`,
      status:       isAdmin ? 'published' : 'pending',  // admin publishes instantly
      title:        title.trim(),
      category,
      date,
      time,
      endTime:      endTime || time,
      location:     location.trim(),
      city:         city.trim(),
      province:     (province || '').trim(),
      description:  description.trim(),
      image:        image || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&q=80',
      price:        parseFloat(price),
      ticketTypes:  Array.isArray(ticketTypes) ? ticketTypes : [],
      featured:     isAdmin ? (req.body.featured === true || req.body.featured === 'true') : false,
      sold_out:     false,
      organiser:    req.user.organisationName || `${req.user.firstName} ${req.user.lastName}`,
      organiserId:  req.user.id,
      tags:         Array.isArray(tags) ? tags : [],
      address:      (address || '').trim() || null,
      paymentType:  paymentType || null,
      paymentLink:  (paymentLink || '').trim() || null,
      bankName:     (bankName || '').trim() || null,
      accountHolder: (accountHolder || '').trim() || null,
      accountNumber: (accountNumber || '').trim() || null,
      branchCode:   (branchCode || '').trim() || null,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };

    await dataStore.saveEvent(event);
    console.log(`[EVENTS] Created: "${event.title}" by ${req.user.email} (status: ${event.status})`);

    return res.status(201).json({ success: true, event });
  } catch (err) {
    next(err);
  }
}

// ── Organiser/Admin: update event ─────────────────────────────────────────────

async function updateEvent(req, res, next) {
  try {
    const existing = await dataStore.getEventById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Event not found.' });

    // Organisers can only edit their own events
    if (req.user.role === 'organiser' && existing.organiserId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only edit your own events.' });
    }

    const errors = validateEventInput(req.body);
    if (errors.length > 0) return res.status(400).json({ success: false, errors });

    const updated = {
      ...existing,
      title:        req.body.title.trim(),
      category:     req.body.category,
      date:         req.body.date,
      time:         req.body.time,
      endTime:      req.body.endTime || req.body.time,
      location:     req.body.location.trim(),
      city:         req.body.city.trim(),
      province:     (req.body.province || '').trim(),
      description:  req.body.description.trim(),
      image:        req.body.image || existing.image,
      price:        parseFloat(req.body.price),
      ticketTypes:  Array.isArray(req.body.ticketTypes) ? req.body.ticketTypes : existing.ticketTypes,
      tags:         Array.isArray(req.body.tags) ? req.body.tags : existing.tags,
      address:        (req.body.address || '').trim() || existing.address,
      paymentType:    req.body.paymentType || existing.paymentType,
      paymentLink:    (req.body.paymentLink || '').trim() || existing.paymentLink,
      bankName:       (req.body.bankName || '').trim() || existing.bankName,
      accountHolder:  (req.body.accountHolder || '').trim() || existing.accountHolder,
      accountNumber:  (req.body.accountNumber || '').trim() || existing.accountNumber,
      branchCode:     (req.body.branchCode || '').trim() || existing.branchCode,
      updatedAt:    new Date().toISOString(),
    };

    // Only admin can change status or featured flag
    if (req.user.role === 'admin') {
      if (req.body.status)   updated.status   = req.body.status;
      if (req.body.featured !== undefined) updated.featured = req.body.featured === true || req.body.featured === 'true';
    }

    await dataStore.saveEvent(updated);
    console.log(`[EVENTS] Updated: "${updated.title}" by ${req.user.email}`);

    return res.json({ success: true, event: updated });
  } catch (err) {
    next(err);
  }
}

// ── Admin: update event status / featured ─────────────────────────────────────

async function updateEventStatus(req, res, next) {
  try {
    const event = await dataStore.getEventById(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });

    const { status, featured } = req.body;
    const allowed = ['published', 'pending', 'rejected', 'cancelled'];

    if (status && !allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(', ')}` });
    }

    if (status)            event.status   = status;
    if (featured !== undefined) event.featured = featured === true || featured === 'true';
    event.updatedAt = new Date().toISOString();

    await dataStore.saveEvent(event);
    console.log(`[EVENTS] Status update: "${event.title}" → ${status || 'no change'}`);

    return res.json({ success: true, event });
  } catch (err) {
    next(err);
  }
}

// ── Organiser/Admin: delete event ─────────────────────────────────────────────

async function deleteEvent(req, res, next) {
  try {
    const event = await dataStore.getEventById(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });

    if (req.user.role === 'organiser' && event.organiserId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You can only delete your own events.' });
    }

    await dataStore.deleteEvent(req.params.id);
    console.log(`[EVENTS] Deleted: "${event.title}" by ${req.user.email}`);

    return res.json({ success: true, message: 'Event deleted.' });
  } catch (err) {
    next(err);
  }
}

// ── Admin: list all users ─────────────────────────────────────────────────────

async function listUsers(req, res, next) {
  try {
    const users = await dataStore.getUsers();
    return res.json({ success: true, users, total: users.length });
  } catch (err) {
    next(err);
  }
}

// ── Admin: update user role ───────────────────────────────────────────────────

async function updateUserRole(req, res, next) {
  try {
    const user = await dataStore.getUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    const allowed = ['attendee', 'organiser', 'admin'];
    if (!allowed.includes(req.body.role)) {
      return res.status(400).json({ success: false, error: 'Invalid role.' });
    }

    user.role = req.body.role;
    await dataStore.saveUser(user);

    return res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

// ── Admin: dashboard stats ────────────────────────────────────────────────────

async function getStats(req, res, next) {
  const { supabaseAdmin } = require('../services/supabase');
  try {
    // Try the view first
    const { data: viewData, error: viewErr } = await supabaseAdmin
      .from('v_dashboard_stats')
      .select('*')
      .maybeSingle();

    if (!viewErr && viewData) {
      return res.json({
        success: true,
        stats: {
          totalEvents:     Number(viewData.total_events),
          publishedEvents: Number(viewData.published_events),
          pendingEvents:   Number(viewData.pending_events),
          featuredEvents:  Number(viewData.featured_events),
          totalUsers:      Number(viewData.total_users),
          organisers:      Number(viewData.total_organisers),
          ticketsSold:     Number(viewData.tickets_sold),
          totalRevenue:    Number(viewData.total_revenue),
        },
      });
    }

    // Fallback: individual queries
    const [eventsRes, profilesRes, ticketsRes] = await Promise.all([
      supabaseAdmin.from('events').select('status, featured'),
      supabaseAdmin.from('profiles').select('role'),
      supabaseAdmin.from('tickets').select('quantity, total').in('status', ['confirmed', 'used']),
    ]);

    const evts  = eventsRes.data   || [];
    const profs = profilesRes.data || [];
    const tkts  = ticketsRes.data  || [];

    return res.json({
      success: true,
      stats: {
        totalEvents:     evts.length,
        publishedEvents: evts.filter(e => e.status === 'published').length,
        pendingEvents:   evts.filter(e => e.status === 'pending').length,
        featuredEvents:  evts.filter(e => e.featured).length,
        totalUsers:      profs.length,
        organisers:      profs.filter(u => u.role === 'organiser').length,
        ticketsSold:     tkts.reduce((s, t) => s + (t.quantity || 0), 0),
        totalRevenue:    tkts.reduce((s, t) => s + parseFloat(t.total || 0), 0),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ── Validation helper ─────────────────────────────────────────────────────────

function validateEventInput(body) {
  const errors = [];
  const { title, category, date, time, location, city, price } = body;
  if (!title    || title.trim().length < 3)    errors.push('Title must be at least 3 characters.');
  if (!category || category.trim().length < 2)  errors.push('Category is required.');
  if (!date     || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('Date must be in YYYY-MM-DD format.');
  if (!time     || !/^\d{2}:\d{2}$/.test(time)) errors.push('Time must be in HH:MM format.');
  if (!location || location.trim().length < 3)  errors.push('Location is required.');
  if (!city     || city.trim().length < 2)      errors.push('City is required.');
  if (price === undefined || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
    errors.push('Price must be a valid number (0 for free events).');
  }
  return errors;
}

// Used by admin enhance route
async function getEventRaw(id) {
  return dataStore.getEventById(id);
}

module.exports = {
  listEvents, getEvent,
  createEvent, updateEvent, updateEventStatus, deleteEvent,
  listUsers, updateUserRole,
  getStats,
  getEventRaw,
};
