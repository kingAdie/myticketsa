'use strict';

/* Resend has support@ticketssa.co.za's root domain unverified — only the
   mail. subdomain is verified, so sends must go out from there. Replies
   still land in the real support inbox via reply_to. */
const FROM     = 'TicketsSA <support@mail.ticketssa.co.za>';
const REPLY_TO = 'support@ticketssa.co.za';

/* TEMP: every booking also CCs this inbox as a stand-in admin notification
   address while the Mbombela hospitality flow is being verified. Swap to the
   real business inbox once confirmed working live. */
const ADMIN_NOTIFICATION_EMAIL = 'ratshimolo112@gmail.com';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const firstName = String(payload.firstName || '').trim();
  const lastName  = String(payload.lastName  || '').trim();
  const email     = String(payload.email     || '').trim();
  const phone     = String(payload.phone     || '').trim();
  const guests    = String(payload.guests    || '1').trim();
  const message   = String(payload.message   || '').trim();

  if (!firstName || !lastName || !email || !phone) {
    return { statusCode: 400, body: 'Missing required fields' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: 'Invalid email address' };
  }

  const ref = `MBV-${Date.now().toString(36).toUpperCase().slice(-5)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const now = new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });

  const html = buildBookingEmail({ firstName, lastName, email, phone, guests, message, ref, now });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:     FROM,
        to:       [email, ADMIN_NOTIFICATION_EMAIL],
        reply_to: REPLY_TO,
        subject:  `Mbombela VIP Hospitality Booking Request — ${ref}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', err);
      return { statusCode: 500, body: 'Email delivery failed' };
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true, ref }) };
  } catch (err) {
    console.error('Fetch error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};

/* ── Email template ───────────────────────────────────────────────────── */

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
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;">

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
            <td style="background:#111111;border:1px solid #2a2210;border-radius:16px;padding:40px 36px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:#4a4a4a;line-height:1.6;">
                © ${new Date().getFullYear()} TicketsSA &nbsp;·&nbsp;
                <a href="https://www.ticketssa.co.za" style="color:#4a4a4a;text-decoration:none;">www.ticketssa.co.za</a>
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

function row(label, val) {
  return `
  <tr>
    <td style="padding:9px 0;border-bottom:1px solid #1f1f1f;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a7a2e;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:9px 0 9px 16px;border-bottom:1px solid #1f1f1f;font-size:14px;color:#eaeaea;text-align:right;">${val}</td>
  </tr>`;
}

function buildBookingEmail({ firstName, lastName, email, phone, guests, message, ref, now }) {
  return shell(`
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <div style="display:inline-block;background:#ffffff;border-radius:14px;padding:14px 18px;">
            <img src="https://ticketssa.co.za/images/mbombela_logo.png" width="64" height="81" alt="Mbombela Stadium" border="0" style="display:block;width:64px;height:81px;"/>
          </div>
        </td>
      </tr>
    </table>

    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;text-align:center;">
      Mbombela VIP Hospitality Booking Request
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#888888;text-align:center;">
      Hi ${escHtml(firstName)}, thanks for your interest in the Mbombela Stadium Premium VIP Hospitality Package.
      Our team will be in touch shortly to confirm availability and payment.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
      ${row('Reference', `<span style="color:#eab308;font-weight:700;">${escHtml(ref)}</span>`)}
      ${row('Submitted', escHtml(now))}
      ${row('Guest', escHtml(`${firstName} ${lastName}`))}
      ${row('Email', escHtml(email))}
      ${row('Phone', escHtml(phone))}
      ${row('Seats requested', escHtml(guests))}
      ${message ? row('Message', escHtml(message)) : ''}
    </table>

    <p style="margin:24px 0 0;font-size:12px;color:#555555;text-align:center;line-height:1.7;">
      Questions in the meantime? Contact Asiat on
      <a href="tel:0827003664" style="color:#eab308;">082 700 3664</a> or
      <a href="mailto:asiat@mbombelastadium.com" style="color:#eab308;">asiat@mbombelastadium.com</a>.
    </p>
  `);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
