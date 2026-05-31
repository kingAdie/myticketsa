'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY     = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.warn('[SUPABASE] Missing env vars — SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY not set.');
}

// Public client — for user-facing auth (signIn, signUp)
const supabase = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '');

// Admin client — bypasses RLS, used for all server-side DB and auth-admin operations
const supabaseAdmin = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_KEY || '', {
  auth: {
    autoRefreshToken: false,
    persistSession:   false,
  },
});

module.exports = { supabase, supabaseAdmin };
