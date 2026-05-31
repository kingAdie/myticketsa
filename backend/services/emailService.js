/**
 * utils/emailService.js
 *
 * Sends transactional emails via Nodemailer.
 *
 * Modes:
 *   EMAIL_PREVIEW=true  → Logs email content to the console (no SMTP needed)
 *   EMAIL_PREVIEW=false → Sends via Gmail SMTP (or any configured host)
 *
 * To use with Gmail:
 *   1. Enable 2-Factor Authentication on your Google account
 *   2. Create an App Password: Account → Security → App Passwords
 *   3. Set EMAIL_USER and EMAIL_PASS in .env
 */

'use strict';

const nodemailer = require('nodemailer');
const { formatDate, formatTime, formatCurrency } = require('./formatters');

// ── Transporter Factory ───────────────────────────────────────────────────────

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (process.env.EMAIL_PREVIEW === 'true') {
    // Use Nodemailer's built-in "ethereal" test account style (console preview)
    _transporter = null; // handled separately in send()
    return null;
  }

  _transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return _transporter;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a booking confirmation email for a ticket.
 * @param {Object} ticket - Full ticket record from ticketService
 */
async function sendConfirmation(ticket) {
  const { buyer, event, ticket: tkt, pricing, id, qrCodeBuffer } = ticket;

  const subject = `Your ticket for ${event.title} – ${id}`;
  const html    = buildConfirmationHTML(ticket);
  const text    = buildConfirmationText(ticket);

  const attachments = [];

  // Attach QR code from the in-memory buffer (no local disk required)
  if (qrCodeBuffer) {
    attachments.push({
      filename: `ticket-${id}.png`,
      content:  qrCodeBuffer,
      cid:      'qrcode@myticketsa',
    });
  }

  const mailOptions = {
    from:        process.env.EMAIL_FROM || 'MyTicketSA <noreply@myticketsa.co.za>',
    to:          `${buyer.firstName} ${buyer.lastName} <${buyer.email}>`,
    subject,
    html,
    text,
    attachments,
  };

  // ── Preview mode: log to console ──────────────────────────────────────────
  if (process.env.EMAIL_PREVIEW === 'true') {
    console.log('\n' + '='.repeat(60));
    console.log('[EMAIL PREVIEW] To:', mailOptions.to);
    console.log('[EMAIL PREVIEW] Subject:', subject);
    console.log('[EMAIL PREVIEW] Ticket ID:', id);
    console.log('[EMAIL PREVIEW] Event:', event.title);
    console.log('[EMAIL PREVIEW] Total Paid:', formatCurrency(pricing.total));
    console.log('[EMAIL PREVIEW] QR Buffer size:', qrCodeBuffer ? `${qrCodeBuffer.length} bytes` : 'none');
    console.log('='.repeat(60) + '\n');
    return { success: true, preview: true };
  }

  // ── Live mode: send via SMTP ──────────────────────────────────────────────
  const transporter = getTransporter();
  const info = await transporter.sendMail(mailOptions);
  console.log(`[EMAIL] Confirmation sent to ${buyer.email} – MessageID: ${info.messageId}`);
  return { success: true, messageId: info.messageId };
}

// ── Email Templates ───────────────────────────────────────────────────────────

/**
 * HTML email template.
 * Inline styles are required for maximum email client compatibility.
 */
function buildConfirmationHTML(ticket) {
  const { buyer, event, ticket: tkt, pricing, id } = ticket;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your MyTicketSA Booking</title>
</head>
<body style="margin:0;padding:0;background:#0B0B0B;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0B0B;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#111111;border-radius:16px 16px 0 0;padding:28px 36px;border-bottom:1px solid rgba(255,255,255,0.08);">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:22px;font-weight:800;letter-spacing:-0.03em;">
                    <span style="color:#16A34A;">my</span><span style="color:#ffffff;">ticket</span><span style="color:#16A34A;">sa</span>
                  </span>
                </td>
                <td align="right">
                  <span style="background:#16A34A;color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:999px;letter-spacing:0.06em;text-transform:uppercase;">Booking Confirmed</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Blue accent bar -->
        <tr>
          <td style="height:3px;background:linear-gradient(90deg,#3B82F6,#1D4ED8);"></td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="background:#111111;padding:36px 36px 24px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#16A34A;">🎟 Your eTicket</p>
            <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#FFFFFF;letter-spacing:-0.03em;line-height:1.2;">${escapeHtml(event.title)}</h1>
            <p style="margin:0;font-size:15px;color:#A1A1AA;">${escapeHtml(event.location)}, ${escapeHtml(event.city)}</p>
          </td>
        </tr>

        <!-- Details Grid -->
        <tr>
          <td style="background:#111111;padding:0 36px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#161616;border-radius:12px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
              <tr>
                <td style="padding:18px 20px;border-right:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06);width:50%;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#52525B;">Date &amp; Time</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#FFFFFF;">${formatDate(event.date)}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:#A1A1AA;">${formatTime(event.time)}</p>
                </td>
                <td style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.06);width:50%;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#52525B;">Venue</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#FFFFFF;">${escapeHtml(event.location)}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:#A1A1AA;">${escapeHtml(event.city)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 20px;border-right:1px solid rgba(255,255,255,0.06);">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#52525B;">Ticket</p>
                  <p style="margin:0;font-size:14px;font-weight:600;color:#FFFFFF;">${escapeHtml(tkt.typeName)}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:#A1A1AA;">× ${tkt.quantity}</p>
                </td>
                <td style="padding:18px 20px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#52525B;">Total Paid</p>
                  <p style="margin:0;font-size:20px;font-weight:800;color:#16A34A;">${formatCurrency(pricing.total)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Ticket ID -->
        <tr>
          <td style="background:#111111;padding:0 36px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#1C1C1C;border-radius:12px;border:1px solid rgba(22,163,74,0.25);padding:18px 20px;">
              <tr>
                <td>
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#52525B;">Ticket ID</p>
                  <p style="margin:0;font-size:20px;font-weight:800;color:#16A34A;font-family:'Courier New',monospace;letter-spacing:0.05em;">${id}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- QR Code -->
        <tr>
          <td style="background:#111111;padding:0 36px 28px;text-align:center;">
            <p style="margin:0 0 14px;font-size:13px;color:#A1A1AA;">Scan this QR code at the entrance</p>
            <img src="cid:qrcode@myticketsa" alt="QR Code" width="180" style="border-radius:12px;border:4px solid #1C1C1C;" />
          </td>
        </tr>

        <!-- Guest name -->
        <tr>
          <td style="background:#111111;padding:0 36px 36px;">
            <p style="margin:0;font-size:14px;color:#A1A1AA;text-align:center;">
              Booked for <strong style="color:#FFFFFF;">${escapeHtml(buyer.firstName)} ${escapeHtml(buyer.lastName)}</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#161616;border-radius:0 0 16px 16px;padding:20px 36px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="margin:0;font-size:12px;color:#52525B;text-align:center;">
              © 2025 MyTicketSA · Built in South Africa 🇿🇦 ·
              <a href="#" style="color:#16A34A;text-decoration:none;">Help Centre</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`.trim();
}

/**
 * Plain-text fallback for email clients that don't render HTML.
 */
function buildConfirmationText(ticket) {
  const { buyer, event, ticket: tkt, pricing, id } = ticket;
  return [
    'MyTicketSA – Booking Confirmation',
    '='.repeat(40),
    '',
    `Hi ${buyer.firstName},`,
    '',
    'Your booking is confirmed!',
    '',
    `Event:    ${event.title}`,
    `Date:     ${formatDate(event.date)} at ${formatTime(event.time)}`,
    `Venue:    ${event.location}, ${event.city}`,
    `Ticket:   ${tkt.typeName} × ${tkt.quantity}`,
    `Total:    ${formatCurrency(pricing.total)}`,
    '',
    `Ticket ID: ${id}`,
    '',
    'Your QR code is attached to this email. Show it at the entrance.',
    '',
    '© 2025 MyTicketSA – Built in South Africa 🇿🇦',
  ].join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

module.exports = { sendConfirmation };
