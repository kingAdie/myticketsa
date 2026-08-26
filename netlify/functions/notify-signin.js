/* Resend has support@ticketssa.co.za's root domain unverified — only the
   mail. subdomain is verified, so sends must go out from there. Replies
   still land in the real support inbox via reply_to. */
const FROM    = 'TicketsSA <support@mail.ticketssa.co.za>';
const SUPPORT = 'support@ticketssa.co.za';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { email, firstName, provider, isNew } = payload;
  if (!email) return { statusCode: 400, body: 'Missing email' };

  const name    = firstName || email.split('@')[0];
  const via     = provider === 'google' ? 'Google' : 'email';
  const now     = new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });

  const send = async (to, subject, html) => {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, reply_to: SUPPORT }),
    });
    if (!res.ok) throw new Error(await res.text());
  };

  try {
    if (isNew) {
      await send(email, `Welcome to TicketsSA, ${name}! 🎟`, buildWelcomeEmail(name, email, via));
    }
    await send(SUPPORT, `${isNew ? '🆕 New user' : '👤 User sign-in'} ${email}`, buildTeamNotif(name, email, via, now, isNew));
    return { statusCode: 200, body: JSON.stringify({ sent: true }) };
  } catch (err) {
    console.error('notify-signin error:', err);
    return { statusCode: 500, body: 'Email delivery failed' };
  }
};

/* ── Shared shell ───────────────────────────────────────── */
function shell(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080808;min-height:100vh;">
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
            <td style="background:#111111;border:1px solid #1e1e1e;border-radius:18px;padding:44px 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:28px;">
              <p style="margin:0;font-size:12px;color:#3a3a3a;line-height:1.7;">
                © ${new Date().getFullYear()} TicketsSA &nbsp;·&nbsp;
                <a href="https://www.ticketssa.co.za" style="color:#3a3a3a;text-decoration:none;">www.ticketssa.co.za</a><br/>
                South Africa's home for live events.
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

/* ── Welcome email (to user) ────────────────────────────── */
function buildWelcomeEmail(firstName, email, via) {
  return shell(`
    <!-- Hero icon -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td align="center">
          <div style="width:72px;height:72px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);
                      border-radius:50%;text-align:center;line-height:72px;">
            <span style="font-size:32px;line-height:1;">🎟</span>
          </div>
        </td>
      </tr>
    </table>

    <h1 style="margin:0 0 10px;font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;text-align:center;">
      Welcome to TicketsSA!
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#777777;text-align:center;line-height:1.6;">
      Hey <strong style="color:#e5e5e5;">${esc(firstName)}</strong>, your account is ready.<br/>
      You signed up via <strong style="color:#e5e5e5;">${esc(via)}</strong> you're all set to explore events.
    </p>

    <!-- What you can do -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      ${feature('🎵', 'Browse Events', 'Concerts, sport, festivals, comedy and more across South Africa.')}
      ${feature('🏨', 'Travel & Stay', 'Find accommodation near your next event.')}
      ${feature('⚡', 'Event Equipment', 'Rent sound, lighting and staging for your own events.')}
    </table>

    <!-- CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
      <tr>
        <td align="center">
          <a href="https://www.ticketssa.co.za"
             style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:700;
                    letter-spacing:-0.01em;text-decoration:none;padding:15px 40px;border-radius:10px;">
            Browse Events
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#444444;text-align:center;line-height:1.65;">
      Questions? Reply to this email or reach us at
      <a href="mailto:support@ticketssa.co.za" style="color:#22c55e;text-decoration:none;">support@ticketssa.co.za</a>
    </p>
  `);
}

function feature(icon, title, desc) {
  return `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid #1a1a1a;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="40" valign="top" style="padding-right:14px;padding-top:2px;font-size:20px;line-height:1;">${icon}</td>
          <td valign="top">
            <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#e5e5e5;">${title}</p>
            <p style="margin:0;font-size:13px;color:#555555;line-height:1.5;">${desc}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/* ── Team notification (to support) ────────────────────── */
function buildTeamNotif(name, email, via, time, isNew) {
  const badge = isNew
    ? `<span style="display:inline-block;background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);
                    border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;letter-spacing:.05em;">NEW USER</span>`
    : `<span style="display:inline-block;background:rgba(59,130,246,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.25);
                    border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;letter-spacing:.05em;">RETURNING</span>`;

  return shell(`
    <p style="margin:0 0 20px;text-align:center;">${badge}</p>

    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;text-align:center;">
      ${isNew ? 'New user joined' : 'User signed in'}
    </h1>
    <p style="margin:0 0 28px;font-size:14px;color:#666666;text-align:center;">${esc(time)} · South Africa</p>

    <!-- Details table -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      ${row('Name',     esc(name))}
      ${row('Email',    `<a href="mailto:${esc(email)}" style="color:#22c55e;text-decoration:none;">${esc(email)}</a>`)}
      ${row('Provider', esc(via))}
      ${row('Time',     esc(time))}
    </table>

    <p style="margin:0;font-size:13px;color:#444444;text-align:center;">
      This is an automated notification from TicketsSA Auth.
    </p>
  `);
}

function row(label, value) {
  return `
  <tr>
    <td style="padding:12px 18px;border-bottom:1px solid #1a1a1a;width:30%;">
      <p style="margin:0;font-size:12px;font-weight:700;color:#444444;text-transform:uppercase;letter-spacing:.06em;">${label}</p>
    </td>
    <td style="padding:12px 18px;border-bottom:1px solid #1a1a1a;">
      <p style="margin:0;font-size:14px;color:#cccccc;">${value}</p>
    </td>
  </tr>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
