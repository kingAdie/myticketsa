'use strict';

/* ================================================
   Shared Paystack → ticket fulfilment (lib/ticket-fulfillment.js)

   Used by BOTH paystack-verify.js (the browser's redirect back
   from Paystack's hosted checkout) and paystack-webhook.js (a
   server-to-server confirmation that arrives independently of
   whether the buyer's browser ever completes that redirect).
   Both call the same idempotent fulfilPaidTransaction() so a
   ticket is created and emailed exactly once no matter which
   path reaches Paystack's "yes, this was paid" first.
   ================================================ */

const { getDb } = require('./firebase-admin');

const FROM     = 'TicketsSA <support@mail.ticketssa.co.za>';
const REPLY_TO = 'support@ticketssa.co.za';

async function findTicketByReference(reference) {
  const db   = getDb();
  const snap = await db.collection('tickets').where('paymentReference', '==', reference).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

function buildTicketRow(txn) {
  const meta  = txn.metadata || {};
  const buyer = meta.buyer   || {};

  const ticketId  = `TKT-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const now       = new Date().toISOString();
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(ticketId)}`;

  return {
    row: {
      id:                ticketId,
      status:            'confirmed',
      buyerFirstName:    buyer.firstName || '',
      buyerLastName:     buyer.lastName  || '',
      buyerEmail:        (buyer.email || '').toLowerCase(),
      buyerPhone:        buyer.phone || null,
      eventId:           meta.eventId,
      eventTitle:        meta.eventTitle,
      eventDate:         meta.eventDate,
      eventTime:         meta.eventTime || null,
      eventLocation:     meta.eventLocation,
      eventCity:         meta.eventCity,
      eventImage:        meta.eventImage || null,
      ticketTypeId:      meta.ticketTypeId,
      ticketTypeName:    meta.ticketTypeName,
      ticketPrice:       parseFloat(meta.ticketPrice) || 0,
      quantity:          parseInt(meta.quantity, 10)  || 1,
      subtotal:          parseFloat(meta.subtotal)    || 0,
      serviceFee:        parseFloat(meta.serviceFee)  || 0,
      total:             parseFloat(meta.total)       || 0,
      paymentMethod:     'paystack',
      paymentReference:  txn.reference,
      paidAt:            now,
      qrCodeUrl:         qrCodeUrl,
      bookedAt:          now,
    },
    qrCodeUrl,
  };
}

async function insertTicket(ticketId, row) {
  const db = getDb();
  await db.collection('tickets').doc(ticketId).create(row);
}

/**
 * Verifies the transaction is actually paid, then creates the ticket + sends
 * the eTicket email exactly once. Safe to call twice for the same reference
 * (the redirect callback and the webhook both call this) later calls see
 * the existing row and skip straight to returning its id.
 */
async function fulfilPaidTransaction(txn) {
  if (!txn || txn.status !== 'success') {
    throw new Error('Transaction not successful');
  }

  const existingId = await findTicketByReference(txn.reference);
  if (existingId) return { ticketId: existingId, created: false };

  const { row, qrCodeUrl } = buildTicketRow(txn);
  await insertTicket(row.id, row);

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:     FROM,
          to:       [row.buyerEmail],
          reply_to: REPLY_TO,
          subject:  `Your eTicket ${row.eventTitle} TicketsSA`,
          html:     buildTicketEmail({ ticketRow: row, qrCodeUrl }),
        }),
      });
    } catch (err) {
      console.error('[ticket-fulfillment] ticket email failed:', err);
      // Payment + ticket are already recorded; email is best-effort.
    }
  }

  return { ticketId: row.id, created: true };
}

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
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <a href="https://www.ticketssa.co.za" style="text-decoration:none;font-size:22px;font-weight:800;letter-spacing:-0.04em;">
                <span style="color:#ffffff;">tickets</span><span style="color:#22c55e;">sa</span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#111111;border:1px solid #223322;border-radius:16px;padding:40px 36px;">
              ${content}
            </td>
          </tr>
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
    <td style="padding:9px 0;border-bottom:1px solid #1f1f1f;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4ade80;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:9px 0 9px 16px;border-bottom:1px solid #1f1f1f;font-size:14px;color:#eaeaea;text-align:right;">${val}</td>
  </tr>`;
}

function buildTicketEmail({ ticketRow, qrCodeUrl }) {
  const guestName = `${ticketRow.buyerFirstName} ${ticketRow.buyerLastName}`.trim();
  const when = `${escHtml(ticketRow.eventDate)}${ticketRow.eventTime ? ' at ' + escHtml(ticketRow.eventTime) : ''}`;
  const total = `R${Number(ticketRow.total || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

  return shell(`
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;text-align:center;">
      Your eTicket is confirmed
    </h1>
    <p style="margin:0 0 24px;font-size:14px;color:#888888;text-align:center;">
      Hi ${escHtml(ticketRow.buyerFirstName)}, thanks for your purchase. See you at ${escHtml(ticketRow.eventTitle)}!
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;">
      ${row('Ticket ID', `<span style="color:#4ade80;font-weight:700;">${escHtml(ticketRow.id)}</span>`)}
      ${row('Event', escHtml(ticketRow.eventTitle))}
      ${row('When', when)}
      ${row('Venue', `${escHtml(ticketRow.eventLocation)}, ${escHtml(ticketRow.eventCity)}`)}
      ${row('Ticket Type', `${escHtml(ticketRow.ticketTypeName)} × ${ticketRow.quantity}`)}
      ${row('Guest', escHtml(guestName))}
      ${row('Total Paid', total)}
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr>
        <td align="center">
          <div style="display:inline-block;background:#ffffff;border-radius:14px;padding:14px;">
            <img src="${qrCodeUrl}" width="160" height="160" alt="Ticket QR Code" border="0" style="display:block;width:160px;height:160px;"/>
          </div>
          <p style="margin:12px 0 0;font-size:11px;color:#666666;">Show this at the entrance</p>
        </td>
      </tr>
    </table>

    <p style="margin:24px 0 0;font-size:12px;color:#555555;text-align:center;line-height:1.7;">
      Questions about this booking? Contact us at
      <a href="mailto:support@ticketssa.co.za" style="color:#4ade80;">support@ticketssa.co.za</a>.
    </p>
  `);
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { fulfilPaidTransaction, findTicketByReference };
