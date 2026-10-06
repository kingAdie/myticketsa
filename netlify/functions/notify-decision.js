'use strict';

/* Tells a seller what happened to their listing (approved, or needs changes).
 *
 * Called by the admin portal right after an admin approves or declines a listing.
 * The caller must be signed in as an admin: we check their Supabase token here,
 * server side, so this cannot be used by anyone else to email people.
 *
 * Env vars: RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY (required); SUPPORT_EMAIL (optional).
 */

const SUPABASE_URL  = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const SITE_URL      = 'https://www.ticketssa.co.za';
const FROM          = 'TicketsSA <support@mail.ticketssa.co.za>';
const REPLY_TO      = process.env.SUPPORT_EMAIL || 'support@ticketssa.co.za';

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

const KINDS = {
  event:         { table: 'events',          titleCol: 'title', page: id => `${SITE_URL}/event.html?id=${encodeURIComponent(id)}`,         label: 'event' },
  accommodation: { table: 'accommodations',  titleCol: 'name',  page: id => `${SITE_URL}/accommodation.html?id=${encodeURIComponent(id)}`, label: 'accommodation listing' },
  listing:       { table: 'seller_listings', titleCol: 'title', page: () => `${SITE_URL}/dashboard.html?tab=listings`,                      label: 'listing' },
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!RESEND_API_KEY || !SERVICE_KEY) return json(500, { error: 'Server misconfiguration' });

  // ── Only a signed-in admin may call this ─────────────────
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const token = (headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Not signed in' });

  let caller;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
    if (!res.ok) return json(401, { error: 'Invalid session' });
    caller = await res.json();
  } catch { return json(502, { error: 'Could not verify session' }); }
  if ((caller.app_metadata || {}).role !== 'admin') return json(403, { error: 'Admins only' });

  // ── Input ────────────────────────────────────────────────
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const kind   = KINDS[body.kind];
  const id     = String(body.id || '');
  const status = String(body.status || '');
  const note   = String(body.note || '').trim().slice(0, 1500);
  if (!kind || !/^[A-Za-z0-9-]{4,60}$/.test(id) || !['published', 'rejected'].includes(status)) return json(400, { error: 'Bad request' });

  const rest = async (path) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!res.ok) throw new Error(`Supabase ${res.status}`);
    return (await res.json())[0] || null;
  };

  try {
    const row = await rest(`${kind.table}?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!row) return json(404, { error: 'Listing not found' });

    // Where to send it: the account owner's email, falling back to the contact email on the listing.
    const ownerId = row.organiser_id || row.owner_id;
    const owner   = ownerId ? await rest(`profiles?id=eq.${encodeURIComponent(ownerId)}&select=email,first_name`) : null;
    const to      = (owner && owner.email) || row.owner_email || row.contact_email;
    if (!to) return json(200, { success: true, sent: 0, note: 'No email address on file' });

    const title = row[kind.titleCol] || 'your listing';
    const approved = status === 'published';
    const mail = approved
      ? {
          subject: `Your ${kind.label} is live: ${title}`,
          heading: 'Your listing is live 🎉',
          lines: [`Good news. <strong>${esc(title)}</strong> has been approved and is now published on TicketsSA.`,
                  'Customers can now find it. Bookings and enquiries go straight to the email address on your listing.'],
          cta: { href: kind.page(id), label: 'View your listing' },
        }
      : {
          subject: `Your ${kind.label} needs changes: ${title}`,
          heading: 'Your listing needs changes',
          lines: [`We reviewed <strong>${esc(title)}</strong> and could not publish it yet.`,
                  note ? `<strong>Reason:</strong> ${esc(note)}` : 'Please check the details and photos, then resubmit.',
                  'Fix what is mentioned, then submit again from your Seller Hub. Reply to this email if you need help.'],
          cta: { href: `${SITE_URL}/dashboard.html?tab=listings`, label: 'Open my Seller Hub' },
        };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject: mail.subject, html: render(mail) }),
    });
    if (!res.ok) { console.error('Resend error:', await res.text()); return json(502, { error: 'Email delivery failed' }); }
    return json(200, { success: true, sent: 1 });
  } catch (err) {
    console.error('notify-decision error:', err);
    return json(500, { error: 'Could not send notification' });
  }
};

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render({ heading, lines, cta }) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#0b0b0b;padding:22px 28px;"><div style="font-size:20px;font-weight:800;color:#fff;">tickets<span style="color:#16A34A;">sa</span></div></td></tr>
      <tr><td style="padding:26px 28px 8px;"><h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${heading}</h1>
        ${lines.map(l => `<p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.7;">${l}</p>`).join('')}
      </td></tr>
      <tr><td style="padding:8px 28px 28px;"><a href="${esc(cta.href)}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">${esc(cta.label)}</a></td></tr>
      <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center;color:#9ca3af;font-size:12px;">TicketsSA · South Africa · ticketssa.co.za</td></tr>
    </table></td></tr></table></body></html>`;
}
