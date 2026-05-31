'use strict';

const { supabase, supabaseAdmin } = require('../services/supabase');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Register ───────────────────────────────────────────────────────────────────
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

    // Create the auth user via the admin API so we can set app_metadata.role
    // (app_metadata is server-side only — clients cannot write to it)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email:         email.trim().toLowerCase(),
      password,
      email_confirm: true,
      app_metadata: { role: userRole },
      user_metadata: {
        firstName:        firstName.trim(),
        lastName:         lastName.trim(),
        organisationName: userRole === 'organiser' ? (organisationName || '').trim() || null : null,
      },
    });

    if (createErr) {
      const msg = createErr.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('already been registered') || createErr.code === 'email_exists') {
        return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
      }
      return next(createErr);
    }

    // The DB trigger creates the profile row but may write role='attendee' regardless
    // of app_metadata (timing issue). Force the correct role explicitly.
    const profileData = {
      id:                created.user.id,
      email:             email.trim().toLowerCase(),
      first_name:        firstName.trim(),
      last_name:         lastName.trim(),
      role:              userRole,
      organisation_name: userRole === 'organiser' ? (organisationName || '').trim() || null : null,
    };
    await supabaseAdmin.from('profiles').upsert(profileData, { onConflict: 'id' });
    await supabaseAdmin.from('profiles').update({ role: userRole }).eq('id', created.user.id);

    // Sign in immediately to return a session token
    const { data: session, error: signInErr } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    });

    if (signInErr || !session?.session?.access_token) {
      // Account created but sign-in failed — return partial success so the
      // frontend can redirect the user to log in manually
      return res.status(201).json({
        success:  true,
        token:    null,
        user:     sanitiseUser(created.user),
        message:  'Account created. Please log in.',
      });
    }

    console.log(`[AUTH] Registered: ${created.user.email} (${userRole})`);

    return res.status(201).json({
      success: true,
      token:   session.session.access_token,
      user:    sanitiseUser(created.user),
    });
  } catch (err) {
    next(err);
  }
}

// ── Login ──────────────────────────────────────────────────────────────────────
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    console.log(`[AUTH] Login: ${data.user.email} (${data.user.app_metadata?.role})`);

    return res.json({
      success: true,
      token:   data.session.access_token,
      user:    sanitiseUser(data.user),
    });
  } catch (err) {
    next(err);
  }
}

// ── Setup profile after Supabase client-side signup ───────────────────────
async function setupProfile(req, res, next) {
  try {
    const { firstName, lastName, role, organisationName } = req.body;
    const userId   = req.user.id;
    const email    = req.user.email;
    const userRole = ['attendee', 'organiser'].includes(role) ? role : 'attendee';

    await supabaseAdmin.from('profiles').upsert({
      id:                userId,
      email,
      first_name:        (firstName || '').trim(),
      last_name:         (lastName  || '').trim(),
      role:              userRole,
      organisation_name: userRole === 'organiser' ? (organisationName || '').trim() || null : null,
    }, { onConflict: 'id' });

    await supabaseAdmin.from('profiles').update({ role: userRole }).eq('id', userId);

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { role: userRole },
    });

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── Get current user ───────────────────────────────────────────────────────────
async function getMe(req, res, next) {
  try {
    const user = await dataStore.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.', code: 'USER_NOT_FOUND' });
    }
    return res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

// ── Sanitise Supabase auth user for API responses ─────────────────────────────
function sanitiseUser(authUser) {
  return {
    id:               authUser.id,
    email:            authUser.email,
    role:             authUser.app_metadata?.role               || 'attendee',
    firstName:        authUser.user_metadata?.firstName         || '',
    lastName:         authUser.user_metadata?.lastName          || '',
    organisationName: authUser.user_metadata?.organisationName  || null,
    createdAt:        authUser.created_at,
  };
}

module.exports = { register, login, getMe, setupProfile };
