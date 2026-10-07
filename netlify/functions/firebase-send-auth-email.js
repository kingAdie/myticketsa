'use strict';

/* ================================================
   Firebase auth email delivery via Resend
   (firebase-send-auth-email.js)

   Firebase Auth's own template emails are sent by Google's
   servers under Firebase's branding, not TicketsSA's, and not
   through Resend. The user wants everything delivered through
   Resend, same as the rest of the site. There's no Supabase-style
   automatic server hook for this on Firebase without Cloud
   Functions, so auth.js calls this directly right after signup /
   on "forgot password" submit generateEmailVerificationLink /
   generatePasswordResetLink (Admin SDK) build the real, working
   action link; this function just brands and sends it.
   ================================================ */

const { admin, getAdminApp } = require('./lib/firebase-admin');

const REDIRECT_URL = 'https://www.ticketssa.co.za/auth-action.html';
/* Resend has support@ticketssa.co.za's root domain unverified — only the
   mail. subdomain is verified, so sends must go out from there. Replies
   still land in the real support inbox via reply_to. */
const FROM     = 'TicketsSA <support@mail.ticketssa.co.za>';
const REPLY_TO = 'support@ticketssa.co.za';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error('[firebase-send-auth-email]', err.message);
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const type  = String(payload.type  || '').trim();
  const email = String(payload.email || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: 'Invalid email address' };
  }
  if (type !== 'signup' && type !== 'recovery') {
    return { statusCode: 400, body: 'Invalid type' };
  }

  const actionCodeSettings = { url: REDIRECT_URL, handleCodeInApp: true };

  let link, firstName = 'there';
  try {
    // Look up the display name for a friendlier greeting best-effort,
    // never blocks sending the link if it fails.
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      firstName = (userRecord.displayName || '').split(' ')[0] || firstName;
    } catch (_) { /* user not found, or no display name — fine */ }

    link = type === 'signup'
      ? await admin.auth().generateEmailVerificationLink(email, actionCodeSettings)
      : await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

  } catch (err) {
    // Anti-enumeration: don't reveal whether the account exists. Report
    // success to the caller either way; just skip the actual send.
    console.warn('[firebase-send-auth-email] link generation skipped:', err.code || err.message);
    return { statusCode: 200, body: JSON.stringify({ sent: false }) };
  }

  const subject = type === 'signup' ? 'Confirm your TicketsSA account' : 'Reset your TicketsSA password';
  const html    = type === 'signup' ? buildConfirmEmail(firstName, email, link) : buildResetEmail(firstName, email, link);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [email], subject, html, reply_to: REPLY_TO }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return { statusCode: 500, body: 'Email delivery failed' };
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    console.error('Fetch error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};

/* ── Email templates (same branding as the old send-auth-email.js) ──────── */

function shell(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>TicketsSA</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <a href="https://www.ticketssa.co.za" style="text-decoration:none;font-size:22px;font-weight:800;letter-spacing:-0.04em;">
                <span style="color:#ffffff;">tickets</span><span style="color:#22c55e;">sa</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#111111;border:1px solid #1f1f1f;border-radius:16px;padding:40px 36px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:#4a4a4a;line-height:1.6;">
                © ${new Date().getFullYear()} TicketsSA &nbsp;·&nbsp;
                <a href="https://www.ticketssa.co.za" style="color:#4a4a4a;text-decoration:none;">www.ticketssa.co.za</a><br/>
                If you didn't request this email you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btn(url, label) {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
    <tr>
      <td align="center">
        <a href="${url}"
           style="display:inline-block;background:#22c55e;color:#000000;font-size:15px;font-weight:700;
                  letter-spacing:-0.01em;text-decoration:none;padding:14px 36px;border-radius:10px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

function fallbackLink(url) {
  return `<p style="margin:20px 0 0;font-size:12px;color:#555555;text-align:center;line-height:1.7;">
    Button not working? Copy and paste this link into your browser:<br/>
    <a href="${url}" style="color:#22c55e;word-break:break-all;">${url}</a>
  </p>`;
}

function buildConfirmEmail(firstName, email, url) {
  return shell(`
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <div style="width:64px;height:64px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.25);
                      border-radius:50%;display:inline-flex;align-items:center;justify-content:center;line-height:64px;text-align:center;">
            <span style="font-size:28px;line-height:1;">✉️</span>
          </div>
        </td>
      </tr>
    </table>

    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;text-align:center;">
      Confirm your email
    </h1>
    <p style="margin:0 0 4px;font-size:15px;color:#888888;text-align:center;">
      Hey ${escHtml(firstName)}, welcome to TicketsSA!
    </p>
    <p style="margin:0;font-size:14px;color:#555555;text-align:center;">
      Tap the button below to verify <strong style="color:#cccccc;">${escHtml(email)}</strong> and activate your account.
    </p>

    ${btn(url, 'Confirm My Account')}

    ${fallbackLink(url)}
  `);
}

function buildResetEmail(firstName, email, url) {
  return shell(`
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <div style="width:64px;height:64px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);
                      border-radius:50%;display:inline-flex;align-items:center;justify-content:center;line-height:64px;text-align:center;">
            <span style="font-size:28px;line-height:1;">🔒</span>
          </div>
        </td>
      </tr>
    </table>

    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;text-align:center;">
      Reset your password
    </h1>
    <p style="margin:0 0 4px;font-size:15px;color:#888888;text-align:center;">
      Hey ${escHtml(firstName)},
    </p>
    <p style="margin:0;font-size:14px;color:#555555;text-align:center;">
      We received a request to reset the password for <strong style="color:#cccccc;">${escHtml(email)}</strong>.
      Click below to set a new one.
    </p>

    ${btn(url, 'Reset My Password')}

    <p style="margin:0;font-size:13px;color:#555555;text-align:center;">
      If you didn't request this, no action is needed your password remains unchanged.
    </p>

    ${fallbackLink(url)}
  `);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
