/**
 * controllers/authController.js
 * Handles registration, login, and profile.
 * Roles: attendee | organiser | admin
 */
'use strict';

const bcrypt    = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../services/dataStore');
const { signToken } = require('../middleware/auth');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Register ──────────────────────────────────────────────────────────────────
async function register(req, res, next) {
  try {
    const { firstName, lastName, email, password, role, organisationName } = req.body;

    const errors = [];
    if (!firstName || firstName.trim().length < 2) errors.push('First name must be at least 2 characters.');
    if (!lastName  || lastName.trim().length < 2)  errors.push('Last name must be at least 2 characters.');
    if (!email     || !EMAIL_REGEX.test(email.trim())) errors.push('A valid email address is required.');
    if (!password  || password.length < 6)          errors.push('Password must be at least 6 characters.');

    if (errors.length) return res.status(400).json({ success: false, errors });

    const userRole = ['attendee', 'organiser'].includes(role) ? role : 'attendee';

    if (await dataStore.getUserByEmail(email.trim())) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = {
      id:               `USR-${uuidv4().slice(0, 8).toUpperCase()}`,
      firstName:        firstName.trim(),
      lastName:         lastName.trim(),
      email:            email.trim().toLowerCase(),
      passwordHash,
      role:             userRole,
      organisationName: userRole === 'organiser' ? (organisationName || '').trim() : null,
      createdAt:        new Date().toISOString(),
    };

    await dataStore.saveUser(user);
    console.log(`[AUTH] Registered: ${user.email} (${user.role})`);

    const token = signToken(user);
    return res.status(201).json({
      success: true,
      token,
      user: sanitiseUser(user), // NOT async — returns plain object
    });
  } catch (err) {
    next(err);
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = await dataStore.getUserByEmail(email.trim());
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    console.log(`[AUTH] Login: ${user.email} (${user.role})`);

    const token = signToken(user);
    return res.json({
      success: true,
      token,
      user: sanitiseUser(user), // NOT async — returns plain object
    });
  } catch (err) {
    next(err);
  }
}

// ── Get current user (verify token still valid + user still exists) ───────────
async function getMe(req, res, next) {
  try {
    const user = await dataStore.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.', code: 'USER_NOT_FOUND' });
    }
    return res.json({ success: true, user: sanitiseUser(user) });
  } catch (err) {
    next(err);
  }
}

// ── Sanitise: strip password hash — MUST NOT be async ────────────────────────
function sanitiseUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

module.exports = { register, login, getMe };
