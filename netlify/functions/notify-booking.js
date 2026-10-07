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
 * Env vars: RESEND_API_KEY, FIREBASE_SERVICE_ACCOUNT_KEY (required);
 *           SUPPORT_EMAIL, ADMIN_EXTRA_EMAILS (optional).
 */

const { getDb } = require('./lib/firebase-admin');

const FROM          = 'TicketsSA <support@mail.ticketssa.co.za>';
const REPLY_TO      = 'support@ticketssa.co.za';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@ticketssa.co.za';
const EXTRA_EMAILS  = (process.env.ADMIN_EXTRA_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
const MAX_AGE_MS    = 60 * 60 * 1000;   // only notify for bookings made in the last hour

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  let db;
  try {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
    db = getDb();
  } catch (err) {
    console.error('notify-booking:', err.message);
    return json(500, { error: 'Server misconfiguration' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const kind = String(body.kind || '');
  const id   = String(body.id   || '');
  if (!['ticket', 'accommodation'].includes(kind) || !/^[A-Za-z0-9-]{4,60}$/.test(id)) {
    return json(400, { error: 'Bad request' });
  }

  const one = async (collection, docId) => {
    const snap = await db.collection(collection).doc(docId).get();
    return snap.exists ? snap.data() : null;
  };

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
  const t = await one('tickets', id);
  if (!t || Date.now() - new Date(t.bookedAt).getTime() > MAX_AGE_MS) return null;

  const ev    = t.eventId ? await one('events', t.eventId) : null;
  const owner = ev && ev.organiserId ? await one('users', ev.organiserId) : null;
  const ownerEmail = owner && owner.email;

  const buyer = `${t.buyerFirstName || ''} ${t.buyerLastName || ''}`.trim();
  const when  = [t.eventDate, t.eventTime && String(t.eventTime).slice(0, 5)].filter(Boolean).join(' · ');
  const where = [t.eventLocation, t.eventCity].filter(Boolean).join(', ');
  const rows  = [
    ['Booking reference', id], ['Event', t.eventTitle], ['When', when], ['Where', where],
    ['Ticket', `${t.ticketTypeName} × ${t.quantity}`], ['Total', `R${Number(t.total).toFixed(2)}`],
    ['Cancellation & refunds', (ev && ev.refundPolicy) || 'As agreed with the organiser. Contact them to cancel.'],
  ];
  const buyerRows = [['Name', buyer], ['Email', t.buyerEmail], ['Phone', t.buyerPhone || 'Not provided']];

  const payment = paymentInstructions(ev);
  const mails = [];

  if (ownerEmail) {
    mails.push({
      to: [ownerEmail], replyTo: t.buyerEmail,
      subject: `New booking: ${t.eventTitle} (${id})`,
      html: shell('New ticket booking', `Someone just booked <strong>${esc(t.eventTitle)}</strong>. Contact them to arrange payment and confirm.`,
        [['Booking', rows], ['Customer', buyerRows]]),
    });
  }
  mails.push({
    to: [t.buyerEmail],
    subject: `Your booking: ${t.eventTitle} (${id})`,
    html: shell('Booking received', `Thanks ${esc(t.buyerFirstName || '')}! The organiser has been notified.${payment ? ' ' + payment : ''}`,
      [['Your booking', rows]]),
  });
  mails.push({
    to: [SUPPORT_EMAIL, ...EXTRA_EMAILS], replyTo: t.buyerEmail,
    subject: `Ticket booking: ${t.eventTitle} (${id})`,
    html: shell('Ticket booking (admin copy)', ownerEmail ? `Owner notified: ${esc(ownerEmail)}` : '<strong>No owner email found for this event: contact the organiser manually.</strong>',
      [['Booking', rows], ['Customer', buyerRows]]),
  });
  return mails;
}

function paymentInstructions(ev) {
  if (!ev || !ev.paymentType || ev.paymentType === 'free') return '';
  if (ev.paymentType === 'link' && ev.paymentLink) return `To pay, use this payment link: ${esc(ev.paymentLink)}.`;
  if (ev.paymentType === 'bank') {
    return `To pay, make an EFT to ${esc(ev.accountHolder || '')} (${esc(ev.bankName || '')}), account ${esc(ev.accountNumber || '')}, branch ${esc(ev.branchCode || '')}, using your booking reference.`;
  }
  return '';
}

/* ── Accommodation booking enquiry ──────────────────────── */
async function accommodationMails(id, one) {
  const b = await one('accommodationBookings', id);
  if (!b || Date.now() - new Date(b.createdAt || Date.now()).getTime() > MAX_AGE_MS) return null;

  const acc   = b.accommodationId ? await one('accommodations', b.accommodationId) : null;
  const owner = acc && acc.ownerId ? await one('users', acc.ownerId) : null;
  const ownerEmail = (acc && acc.contactEmail) || (owner && owner.email);

  const rows = [
    ['Reference', id], ['Property', b.accommodationName], ['Room / unit', b.spaceTypeName],
    ['Check-in', b.checkInDate], ['Check-out', b.checkOutDate], ['Nights', b.nights],
    ['Guests', b.guests], ['Estimated total', `R${Number(b.totalPrice).toFixed(2)}`],
    ['Special requests', b.specialRequests || 'None'],
    ['Cancellation & refunds', (acc && acc.refundPolicy) || 'As agreed with the owner. Contact them to cancel.'],
  ];
  const guestRows = [['Name', b.customerName], ['Email', b.customerEmail], ['Phone', b.customerPhone || 'Not provided']];

  const mails = [];
  if (ownerEmail) {
    mails.push({
      to: [ownerEmail], replyTo: b.customerEmail,
      subject: `New booking enquiry: ${b.accommodationName} (${id})`,
      html: shell('New booking enquiry', 'A guest would like to stay with you. Reply to this email or contact them directly to confirm availability and arrange payment.',
        [['Enquiry', rows], ['Guest', guestRows]]),
    });
  }
  mails.push({
    to: [b.customerEmail],
    subject: `Your booking enquiry: ${b.accommodationName} (${id})`,
    html: shell('Enquiry sent', `Thanks ${esc(b.customerName || '')}! The owner has been notified and will contact you to confirm your stay. Nothing is charged by TicketsSA.${acc && paymentInstructions(acc) ? ' Once the owner confirms your dates: ' + paymentInstructions(acc) : ''}`,
      [['Your enquiry', rows]]),
  });
  mails.push({
    to: [SUPPORT_EMAIL, ...EXTRA_EMAILS], replyTo: b.customerEmail,
    subject: `Accommodation enquiry: ${b.accommodationName} (${id})`,
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
