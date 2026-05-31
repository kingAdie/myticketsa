'use strict';

const jwt    = require('jsonwebtoken');
const config = require('../config');

// Supabase signs its JWTs with the project's JWT secret (HS256).
// Verifying locally avoids an HTTP call to Supabase on every request.
const SECRET = config.supabase.jwtSecret;

function extractToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function buildUser(payload) {
  return {
    id:               payload.sub,
    email:            payload.email,
    // prefer app_metadata.role (server-set, secure) then user_metadata.role (set at signup)
    role:             payload.app_metadata?.role || payload.user_metadata?.role || 'attendee',
    firstName:        payload.user_metadata?.firstName        || '',
    lastName:         payload.user_metadata?.lastName         || '',
    organisationName: payload.user_metadata?.organisationName || null,
  };
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }
  try {
    req.user = buildUser(jwt.verify(token, SECRET));
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Your session has expired. Please log in again.'
      : 'Invalid session. Please log in again.';
    return res.status(401).json({ success: false, error: msg, code: 'TOKEN_INVALID' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  next();
}

function requireOrganiser(req, res, next) {
  if (!['admin', 'organiser'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Organiser access required.' });
  }
  next();
}

function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = buildUser(jwt.verify(token, SECRET));
  } catch { /* ignore invalid/expired on public routes */ }
  next();
}

module.exports = { requireAuth, requireAdmin, requireOrganiser, optionalAuth };
