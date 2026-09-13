'use strict';

/* ================================================
   Cloudflare Turnstile server-side verification
   (verify-turnstile.js)

   Supabase used to check the Turnstile token itself as part of
   signInWithPassword/signUp (captchaToken passthrough). Firebase
   Auth has no equivalent, so auth.js calls this function first
   and only proceeds to Firebase if the token actually checks out
   otherwise the CAPTCHA widget would just be decorative.
   ================================================ */

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
  if (!TURNSTILE_SECRET_KEY) {
    console.error('TURNSTILE_SECRET_KEY not set');
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const token = String(payload.token || '');
  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Missing token' }) };
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret:   TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || undefined,
      }),
    });
    const data = await res.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: !!data.success }),
    };
  } catch (err) {
    console.error('[verify-turnstile] error:', err);
    return { statusCode: 502, body: JSON.stringify({ success: false, error: 'Verification service unavailable' }) };
  }
};
