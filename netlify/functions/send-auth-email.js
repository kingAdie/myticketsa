'use strict';

const crypto = require('crypto');

const SUPABASE_URL = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const REDIRECT_URL = 'https://www.ticketssa.co.za/auth-callback.html';
const FROM         = 'TicketsSA <support@ticketssa.co.za>';
const MAX_CLOCK_SKEW_SECONDS = 180;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const HOOK_SECRET     = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!RESEND_API_KEY || !HOOK_SECRET) {
    console.error('RESEND_API_KEY or SEND_EMAIL_HOOK_SECRET not set');
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  const id        = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];

  if (!id || !timestamp || !sigHeader) {
    return { statusCode: 400, body: 'Missing webhook headers' };
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (!Number.isFinite(ageSeconds) || ageSeconds > MAX_CLOCK_SKEW_SECONDS) {
    return { statusCode: 400, body: 'Timestamp out of tolerance' };
  }

  if (!isValidSignature(id, timestamp, rawBody, sigHeader, HOOK_SECRET)) {
    console.warn('[send-auth-email] Signature verification failed for webhook-id:', id);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { user, email_data } = payload;
  if (!user?.email || !email_data?.email_action_type) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const email      = user.email;
  const firstName  = user.user_metadata?.firstName
                  || user.user_metadata?.full_name?.split(' ')[0]
                  || 'there';
  const actionType = email_data.email_action_type;
  const tokenHash  = email_data.token_hash;
  const redirectTo = email_data.redirect_to || REDIRECT_URL;

  const verifyUrl = `${SUPABASE_URL}/auth/v1/verify?token=${tokenHash}&type=${actionType}&redirect_to=${encodeURIComponent(redirectTo)}`;

  let subject, html;

  if (actionType === 'signup') {
    subject = 'Confirm your TicketsSA account';
    html    = buildConfirmEmail(firstName, email, verifyUrl);
  } else if (actionType === 'recovery') {
    subject = 'Reset your TicketsSA password';
    html    = buildResetEmail(firstName, email, verifyUrl);
  } else if (actionType === 'email_change') {
    subject = 'Confirm your new email TicketsSA';
    html    = buildEmailChangeEmail(firstName, email, verifyUrl);
  } else {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, type: actionType }) };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [email], subject, html }),
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

function isValidSignature(id, timestamp, rawBody, sigHeader, secret) {
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const secretB64 = secret.split(',').pop().replace(/^whsec_/, '');
  const key = Buffer.from(secretB64, 'base64');
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expected);

  return sigHeader.split(' ').some((part) => {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

/* ── Email templates ──────────────────────────────────────────────────────── */

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

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <a href="https://www.ticketssa.co.za" style="text-decoration:none;font-size:22px;font-weight:800;letter-spacing:-0.04em;">
                <span style="color:#ffffff;">tickets</span><span style="color:#22c55e;">sa</span>
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#111111;border:1px solid #1f1f1f;border-radius:16px;padding:40px 36px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
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
    <!-- Icon -->
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

    <p style="margin:0;font-size:13px;color:#555555;text-align:center;">
      This link expires in <strong style="color:#888888;">24 hours</strong>.
    </p>

    ${fallbackLink(url)}
  `);
}

function buildResetEmail(firstName, email, url) {
  return shell(`
    <!-- Icon -->
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
      This link expires in <strong style="color:#888888;">1 hour</strong>.
      If you didn't request this, no action is needed your password remains unchanged.
    </p>

    ${fallbackLink(url)}
  `);
}

function buildEmailChangeEmail(firstName, email, url) {
  return shell(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;text-align:center;">
      Confirm your new email
    </h1>
    <p style="margin:0 0 4px;font-size:15px;color:#888888;text-align:center;">
      Hey ${escHtml(firstName)},
    </p>
    <p style="margin:0;font-size:14px;color:#555555;text-align:center;">
      Confirm that <strong style="color:#cccccc;">${escHtml(email)}</strong> is your new email address.
    </p>

    ${btn(url, 'Confirm New Email')}

    <p style="margin:0;font-size:13px;color:#555555;text-align:center;">
      This link expires in <strong style="color:#888888;">24 hours</strong>.
    </p>

    ${fallbackLink(url)}
  `);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
