/**
 * controllers/serviceRequestController.js
 * Handles equipment / service rental requests.
 *
 * Organiser routes:
 *   POST   /api/requests          → create a request
 *   GET    /api/requests          → list my requests
 *   GET    /api/requests/:id      → get one request
 *
 * Admin routes (via /api/admin/requests):
 *   GET    /api/admin/requests          → list all requests
 *   PUT    /api/admin/requests/:id/status → update status
 */
'use strict';

const svc = require('../services/serviceRequestService');

// ── Organiser: create ─────────────────────────────────────────────────────────
async function createRequest(req, res, next) {
  try {
    const {
      serviceId, serviceName, eventDate, duration,
      location, quantity, details, contactPhone, budgetRange,
    } = req.body;

    const errors = [];
    if (!serviceId)    errors.push('serviceId is required.');
    if (!serviceName)  errors.push('serviceName is required.');
    if (!eventDate)    errors.push('eventDate is required.');
    if (!location)     errors.push('location is required.');
    if (!contactPhone) errors.push('contactPhone is required.');
    if (errors.length) return res.status(400).json({ success: false, errors });

    const request = await svc.createRequest({
      userId:       req.user.id,
      serviceId, serviceName, eventDate, duration,
      location, quantity, details, contactPhone, budgetRange,
    });

    console.log(`[REQUEST] Created: ${serviceName} by ${req.user.email}`);
    return res.status(201).json({ success: true, request });
  } catch (err) {
    next(err);
  }
}

// ── Organiser: list own requests ──────────────────────────────────────────────
async function listMyRequests(req, res, next) {
  try {
    const requests = await svc.getRequestsByUser(req.user.id);
    return res.json({ success: true, requests, total: requests.length });
  } catch (err) {
    next(err);
  }
}

// ── Organiser: get one ────────────────────────────────────────────────────────
async function getRequest(req, res, next) {
  try {
    const request = await svc.getRequestById(req.params.id);
    if (!request) return res.status(404).json({ success: false, error: 'Request not found.' });

    // Organisers can only see their own
    if (req.user.role !== 'admin' && request.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Access denied.' });
    }

    return res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
}

// ── Admin: list all ───────────────────────────────────────────────────────────
async function listAllRequests(req, res, next) {
  try {
    const { status } = req.query;
    const requests = await svc.getAllRequests(status ? { status } : {});
    return res.json({ success: true, requests, total: requests.length });
  } catch (err) {
    next(err);
  }
}

// ── Admin: update status ──────────────────────────────────────────────────────
async function updateRequestStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required.' });

    const existing = await svc.getRequestById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Request not found.' });

    const updated = await svc.updateRequestStatus(req.params.id, status);
    console.log(`[REQUEST] Status: #${req.params.id} → ${status} by ${req.user.email}`);
    return res.json({ success: true, request: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRequest, listMyRequests, getRequest,
  listAllRequests, updateRequestStatus,
};
