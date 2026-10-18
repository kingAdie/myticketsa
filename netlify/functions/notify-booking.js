'use strict';

/* Booking notifications.
 *
 * Called by the browser right after a ticket booking or accommodation booking
 * enquiry is saved. The browser only sends the record's id; this function reads
 * the record from Supabase itself (service-role key, server side only) and works
 * out who to email. That way nobody can use it to email arbitrary addresses.
 *
 *   ticket           -> the event owner, the buyer, and the TicketsSA support inbox
 *   ticket_proof     -> the event owner (the buyer uploaded proof of payment)
 *   ticket_confirmed -> the buyer (the organiser confirmed payment: here is your ticket)
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
const SITE_URL      = 'https://ticketssa.co.za';
const ticketLink    = id => `${SITE_URL}/ticket.html?id=${encodeURIComponent(id)}`;
const fresh         = iso => iso && Date.now() - new Date(iso).getTime() <= MAX_AGE_MS;

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
  if (!['ticket', 'ticket_proof', 'ticket_confirmed', 'accommodation'].includes(kind) || !/^[A-Za-z0-9-]{4,60}$/.test(id)) {
    return json(400, { error: 'Bad request' });
  }

  const one = async (collection, docId) => {
    const snap = await db.collection(collection).doc(docId).get();
    return snap.exists ? snap.data() : null;
  };

  try {
    const mails = kind === 'ticket'           ? await ticketMails(id, one)
                : kind === 'ticket_proof'     ? await ticketProofMails(id, one)
                : kind === 'ticket_confirmed' ? await ticketConfirmedMails(id, one)
                :                               await accommodationMails(id, one);
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
      html: shell(t.status === 'reserved' ? 'New reservation' : 'New ticket booking',
        hi(owner) + (t.status === 'reserved'
          ? `Someone reserved <strong>${esc(t.eventTitle)}</strong>. When their payment reaches you, open your Seller Hub → Bookings and click <strong>Mark as paid</strong>. That sends them their ticket.`
          : `Someone booked <strong>${esc(t.eventTitle)}</strong> (free event). Their ticket is already valid.`),
        [['Booking', rows], ['Customer', buyerRows]]),
    });
  }
  mails.push({
    to: [t.buyerEmail],
    subject: t.status === 'reserved' ? `Reserved: ${t.eventTitle} (${id}). Pay to get your ticket` : `Your ticket: ${t.eventTitle} (${id})`,
    html: t.status === 'reserved'
      ? shell('Your seat is reserved', `Thanks ${esc(t.buyerFirstName || '')}! Your seat is held${t.expiresAt ? ` until <strong>${esc(new Date(t.expiresAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' }))}</strong>` : ''}. ${payment || 'The organiser will contact you about payment.'} Use <strong>${esc(id)}</strong> as your payment reference. After paying you can upload your proof of payment here: <a href="${ticketLink(id)}">${ticketLink(id)}</a>. Your QR ticket arrives once the organiser confirms your payment.`,
          [['Your booking', rows]])
      : shell('Your ticket is ready', `Thanks ${esc(t.buyerFirstName || '')}! Show this ticket at the entrance: <a href="${ticketLink(id)}">${ticketLink(id)}</a>`,
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

/* ── Buyer uploaded proof of payment: tell the organiser ── */
async function ticketProofMails(id, one) {
  const t = await one('tickets', id);
  if (!t || t.status !== 'reserved' || !fresh(t.proofUploadedAt)) return null;
  const ev    = t.eventId ? await one('events', t.eventId) : null;
  const owner = ev && ev.organiserId ? await one('users', ev.organiserId) : null;
  if (!owner || !owner.email) return null;
  return [{
    to: [owner.email], replyTo: t.buyerEmail,
    subject: `Proof of payment uploaded: ${t.eventTitle} (${id})`,
    html: shell('Proof of payment received', hi(owner) + `${esc(`${t.buyerFirstName || ''} ${t.buyerLastName || ''}`.trim())} uploaded proof of payment for <strong>${esc(t.eventTitle)}</strong>. Check the money is in your account, then open your Seller Hub → Bookings and click <strong>Mark as paid</strong>: <a href="${SITE_URL}/dashboard.html?tab=orders">${SITE_URL}/dashboard.html?tab=orders</a>. Proof: <a href="${esc(t.proofUrl)}">view the upload</a>.`,
      [['Booking', [['Reference', id], ['Ticket', `${t.ticketTypeName} × ${t.quantity}`], ['Total', `R${Number(t.total).toFixed(2)}`], ['Buyer email', t.buyerEmail]]]]),
  }];
}

/* ── Organiser confirmed payment: send the buyer their ticket ── */
async function ticketConfirmedMails(id, one) {
  const t = await one('tickets', id);
  if (!t || t.status !== 'confirmed' || !fresh(t.confirmedAt)) return null;
  const when  = [t.eventDate, t.eventTime && String(t.eventTime).slice(0, 5)].filter(Boolean).join(' · ');
  return [{
    to: [t.buyerEmail],
    subject: `Payment confirmed. Your ticket for ${t.eventTitle}`,
    html: shell('Your ticket is ready 🎉', `Hi ${esc(t.buyerFirstName || 'there')}, the organiser confirmed your payment. Open your ticket and show the QR code at the entrance: <a href="${ticketLink(id)}">${ticketLink(id)}</a>`,
      [['Your ticket', [['Reference', id], ['Event', t.eventTitle], ['When', when], ['Where', [t.eventLocation, t.eventCity].filter(Boolean).join(', ')], ['Ticket', `${t.ticketTypeName} × ${t.quantity}`]]]]),
  }];
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
      html: shell('New booking enquiry', hi(owner) + 'A guest would like to stay with you. Reply to this email or contact them directly to confirm availability and arrange payment.',
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

// "Hi Thabo, " — personal greeting for account holders (falls back to "Hi there, ").
function hi(u) {
  const n = (u && (u.firstName || String(u.displayName || '').split(' ')[0])) || 'there';
  return `Hi ${esc(n)}, `;
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
