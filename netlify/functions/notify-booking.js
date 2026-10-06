'use strict';

/* Booking notifications.
 *
 * Called by the browser right after a ticket booking or accommodation booking
 * enquiry is saved. The browser only sends the record's id; this function reads
 * the record from Supabase itself (service-role key, server side only) and works
 * out who to email. That way nobody can use it to email arbitrary addresses.
 *
 *   ticket         -> the event owner, the buyer, and the TicketsSA support inbox
 *   accommodation  -> the property owner, the guest, and the TicketsSA support inbox
 *
 * TicketsSA does not take payment. The buyer's email carries the owner's own
 * payment instructions.
 *
 * Env vars: RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY (required);
 *           SUPPORT_EMAIL, ADMIN_EXTRA_EMAILS (optional).
 */

const SUPABASE_URL  = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const FROM          = 'TicketsSA <support@mail.ticketssa.co.za>';
const REPLY_TO      = 'support@ticketssa.co.za';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@ticketssa.co.za';
const EXTRA_EMAILS  = (process.env.ADMIN_EXTRA_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const MAX_AGE_MS    = 60 * 60 * 1000;   // only notify for bookings made in the last hour

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const SERVICE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!RESEND_API_KEY || !SERVICE_KEY) {
    console.error('notify-booking: RESEND_API_KEY or SUPABASE_SERVICE_ROLE_KEY not set');
    return json(500, { error: 'Server misconfiguration' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const kind = String(body.kind || '');
  const id   = String(body.id   || '');
  if (!['ticket', 'accommodation'].includes(kind) || !/^[A-Za-z0-9-]{4,60}$/.test(id)) {
    return json(400, { error: 'Bad request' });
  }

  const rest = async (path) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res.json();
  };
  const one = async (path) => (await rest(path))[0] || null;

  try {
    const mails = kind === 'ticket' ? await ticketMails(id, one) : await accommodationMails(id, one);
    if (!mails) return json(404, { error: 'Booking not found or too old' });

    const results = await Promise.all(mails.map(m => send(RESEND_API_KEY, m)));
    const failed = results.filter(r => !r.ok).length;
    if (failed === results.length) return json(502, { error: 'Email delivery failed' });
    return json(200, { success: true, sent: results.length - failed });
  } catch (err) {
    console.error('notify-booking error:', err);
    return json(500, { error: 'Could not send notifications' });
  }
};

async function send(key, { to, subject, html, replyTo }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html, reply_to: replyTo || REPLY_TO }),
    });
    if (!res.ok) console.error('Resend error:', await res.text());
    return { ok: res.ok };
  } catch (e) {
    console.error('Resend request failed:', e);
    return { ok: false };
  }
}

/* ── Ticket booking ─────────────────────────────────────── */
async function ticketMails(id, one) {
  const t = await one(`tickets?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!t || Date.now() - new Date(t.booked_at).getTime() > MAX_AGE_MS) return null;

  const ev    = await one(`events?id=eq.${encodeURIComponent(t.event_id)}&select=*`);
  const owner = ev && ev.organiser_id ? await one(`profiles?id=eq.${encodeURIComponent(ev.organiser_id)}&select=email,first_name`) : null;
  const ownerEmail = owner && owner.email;

  const buyer = `${t.buyer_first_name || ''} ${t.buyer_last_name || ''}`.trim();
  const when  = [t.event_date, t.event_time && String(t.event_time).slice(0, 5)].filter(Boolean).join(' · ');
  const where = [t.event_location, t.event_city].filter(Boolean).join(', ');
  const rows  = [
    ['Booking reference', t.id], ['Event', t.event_title], ['When', when], ['Where', where],
    ['Ticket', `${t.ticket_type_name} × ${t.quantity}`], ['Total', `R${Number(t.total).toFixed(2)}`],
    ['Cancellation & refunds', (ev && ev.refund_policy) || "As agreed with the organiser. Contact them to cancel."],
  ];
  const buyerRows = [['Name', buyer], ['Email', t.buyer_email], ['Phone', t.buyer_phone || 'Not provided']];

  const payment = paymentInstructions(ev);
  const mails = [];

  if (ownerEmail) {
    mails.push({
      to: [ownerEmail], replyTo: t.buyer_email,
      subject: `New booking: ${t.event_title} (${t.id})`,
      html: shell('New ticket booking', `Someone just booked <strong>${esc(t.event_title)}</strong>. Contact them to arrange payment and confirm.`,
        [['Booking', rows], ['Customer', buyerRows]]),
    });
  }
  mails.push({
    to: [t.buyer_email],
    subject: `Your booking: ${t.event_title} (${t.id})`,
    html: shell('Booking received', `Thanks ${esc(t.buyer_first_name || '')}! The organiser has been notified.${payment ? ' ' + payment : ''}`,
      [['Your booking', rows]]),
  });
  mails.push({
    to: [SUPPORT_EMAIL, ...EXTRA_EMAILS], replyTo: t.buyer_email,
    subject: `Ticket booking: ${t.event_title} (${t.id})`,
    html: shell('Ticket booking (admin copy)', ownerEmail ? `Owner notified: ${esc(ownerEmail)}` : '<strong>No owner email found for this event: contact the organiser manually.</strong>',
      [['Booking', rows], ['Customer', buyerRows]]),
  });
  return mails;
}

function paymentInstructions(ev) {
  if (!ev || !ev.payment_type || ev.payment_type === 'free') return '';
  if (ev.payment_type === 'link' && ev.payment_link) return `To pay, use the organiser's payment link: ${esc(ev.payment_link)}.`;
  if (ev.payment_type === 'bank') {
    return `To pay, make an EFT to ${esc(ev.account_holder || '')} (${esc(ev.bank_name || '')}), account ${esc(ev.account_number || '')}, branch ${esc(ev.branch_code || '')}, using your booking reference.`;
  }
  return '';
}

/* ── Accommodation booking enquiry ──────────────────────── */
async function accommodationMails(id, one) {
  const b = await one(`accommodation_bookings?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!b || Date.now() - new Date(b.created_at || Date.now()).getTime() > MAX_AGE_MS) return null;

  const acc = await one(`accommodations?id=eq.${encodeURIComponent(b.accommodation_id)}&select=*`);
  const ownerEmail = acc && acc.contact_email;

  const rows = [
    ['Reference', b.id], ['Property', b.accommodation_name], ['Room / unit', b.space_type_name],
    ['Check-in', b.check_in_date], ['Check-out', b.check_out_date], ['Nights', b.nights],
    ['Guests', b.guests], ['Estimated total', `R${Number(b.total_price).toFixed(2)}`],
    ['Special requests', b.special_requests || 'None'],
    ['Cancellation & refunds', (acc && acc.refund_policy) || 'As agreed with the owner. Contact them to cancel.'],
  ];
  const guestRows = [['Name', b.customer_name], ['Email', b.customer_email], ['Phone', b.customer_phone || 'Not provided']];

  const mails = [];
  if (ownerEmail) {
    mails.push({
      to: [ownerEmail], replyTo: b.customer_email,
      subject: `New booking enquiry: ${b.accommodation_name} (${b.id})`,
      html: shell('New booking enquiry', 'A guest would like to stay with you. Reply to this email or contact them directly to confirm availability and arrange payment.',
        [['Enquiry', rows], ['Guest', guestRows]]),
    });
  }
  mails.push({
    to: [b.customer_email],
    subject: `Your booking enquiry: ${b.accommodation_name} (${b.id})`,
    html: shell('Enquiry sent', `Thanks ${esc(b.customer_name || '')}! The owner has been notified and will contact you to confirm your stay. Nothing is charged by TicketsSA.`,
      [['Your enquiry', rows]]),
  });
  mails.push({
    to: [SUPPORT_EMAIL, ...EXTRA_EMAILS], replyTo: b.customer_email,
    subject: `Accommodation enquiry: ${b.accommodation_name} (${b.id})`,
    html: shell('Accommodation enquiry (admin copy)', ownerEmail ? `Owner notified: ${esc(ownerEmail)}` : '<strong>No owner email on this listing: contact the owner manually.</strong>',
      [['Enquiry', rows], ['Guest', guestRows]]),
  });
  return mails;
}

/* ── Email layout ───────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shell(title, intro, sections) {
  const blocks = sections.map(([heading, rows]) => `
    <tr><td style="padding:12px 28px 4px;">
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;">${esc(heading)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${rows.filter(r => r[1] !== '' && r[1] != null).map(([k, v]) => `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:150px;vertical-align:top;">${esc(k)}</td><td style="padding:8px 0;color:#111827;font-size:14px;">${esc(v)}</td></tr>`).join('')}
      </table>
    </td></tr>`).join('');
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;">
      <tr><td style="background:#0b0b0b;padding:22px 28px;"><div style="font-size:20px;font-weight:800;color:#fff;">tickets<span style="color:#16A34A;">sa</span></div></td></tr>
      <tr><td style="padding:26px 28px 8px;"><h1 style="margin:0 0 8px;font-size:20px;color:#111827;">${esc(title)}</h1><p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${intro}</p></td></tr>
      ${blocks}
      <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">TicketsSA · South Africa · ticketssa.co.za</td></tr>
    </table></td></tr></table></body></html>`;
}
