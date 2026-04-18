/**
 * middleware/auth.js
 * JWT verification + role guards.
 */
'use strict';

const jwt    = require('jsonwebtoken');
const config = require('../config');

const SECRET = config.jwt.secret;

/**
 * requireAuth — verify Bearer token, attach req.user.
 * Returns 401 if missing or expired.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload; // { id, email, role, firstName, lastName, iat, exp }
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Your session has expired. Please log in again.'
      : 'Invalid session. Please log in again.';
    return res.status(401).json({ success: false, error: msg, code: 'TOKEN_INVALID' });
  }
}

/**
 * requireAdmin — must run AFTER requireAuth.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  next();
}

/**
 * requireOrganiser — organiser OR admin.
 */
function requireOrganiser(req, res, next) {
  if (!['admin', 'organiser'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, error: 'Organiser access required.' });
  }
  next();
}

/**
 * optionalAuth — attach user if token present, never fail.
 * Used on public routes that behave differently for logged-in users.
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, SECRET);
  } catch { /* ignore invalid/expired tokens on public routes */ }
  next();
}

/**
 * signToken — create a signed JWT for a user record.
 */
function signToken(user) {
  return jwt.sign(
    {
      id:        user.id,
      email:     user.email,
      role:      user.role,
      firstName: user.firstName,
      lastName:  user.lastName,
    },
    SECRET,
    { expiresIn: config.jwt.expiresIn }
  );
}

module.exports = { requireAuth, requireAdmin, requireOrganiser, optionalAuth, signToken };
