'use strict';

/* Listing notifications.
 *
 * Called by the listing wizards after a seller submits something.
 *   - event / accommodation / experience  already saved in Supabase as `pending`;
 *     this just tells the team and sends the seller a receipt.
 *   - equipment / merchandise  also saved to `seller_listings` by the browser;
 *     the email is the backup delivery path.
 *   - seller_access  a legacy request type, still accepted.
 *
 * Two emails per call: a notification to the support inbox (reply-to is the
 * seller, so "Reply" goes straight to them) and a receipt to the seller.
 *
 * Env vars (Netlify): RESEND_API_KEY (required), SUPPORT_EMAIL (default
 * support@ticketssa.co.za), ADMIN_EXTRA_EMAILS (optional, comma separated).
 */

const FROM          = 'TicketsSA <support@mail.ticketssa.co.za>';
const REPLY_TO      = 'support@ticketssa.co.za';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@ticketssa.co.za';
const EXTRA_EMAILS  = (process.env.ADMIN_EXTRA_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

const KINDS = {
  event:         { label: 'Event listing',              prefix: 'EVT' },
  accommodation: { label: 'Accommodation listing',      prefix: 'ACC' },
  experience:    { label: 'Experience listing',         prefix: 'EXP' },
  equipment:     { label: 'Equipment hire listing',     prefix: 'EQP' },
  merchandise:   { label: 'Merchandise seller',         prefix: 'MRC' },
  equipment_request: { label: 'Equipment request',      prefix: 'REQ', next: 'the TicketsSA team has received your request and will match you with available equipment and come back to you with a quote, usually within one working day.' },
  seller_access: { label: 'Seller account request',     prefix: 'SEL' },
};

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

  const kind = String(payload.kind || '').trim();
  if (!KINDS[kind]) return { statusCode: 400, body: 'Unknown application type' };

  const contactName  = String(payload.contactName  || '').trim();
  const contactEmail = String(payload.contactEmail || '').trim();
  const contactPhone = String(payload.contactPhone || '').trim();
  const title        = String(payload.title        || '').trim();

  if (!contactName || !contactEmail || !title) {
    return { statusCode: 400, body: 'Missing required fields' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return { statusCode: 400, body: 'Invalid email address' };
  }

  /* `details` is an ordered list of {label, value} the wizard already
     formatted, so this function stays agnostic to each category's fields. */
  const details = Array.isArray(payload.details) ? payload.details.slice(0, 40) : [];

  const meta = KINDS[kind];
  const ref  = `${meta.prefix}-${Date.now().toString(36).toUpperCase().slice(-5)}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  const now  = new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });

  const phone = contactPhone || 'Not provided';
  const html  = buildEmail({ meta, ref, now, contactName, contactEmail, contactPhone: phone, title, details });

  const send = (payload) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, html, ...payload }),
  });

  try {
    /* Team notification first: this is the one that must not be lost. */
    const adminRes = await send({
      to:       [SUPPORT_EMAIL, ...EXTRA_EMAILS],
      reply_to: contactEmail,
      subject:  `New ${meta.label.toLowerCase()}: ${title} (${ref})`,
    });
    if (!adminRes.ok) {
      console.error('Resend error (team notification):', await adminRes.text());
      return { statusCode: 500, body: 'Email delivery failed' };
    }

    /* Seller receipt. Failure here is logged but not fatal. */
    const sellerRes = await send({
      to:       [contactEmail],
      reply_to: REPLY_TO,
      subject:  `We received your ${meta.label.toLowerCase()} — ${title} (${ref})`,
    });
    if (!sellerRes.ok) console.error('Resend error (seller receipt):', await sellerRes.text());
  } catch (e) {
    console.error('Resend request failed:', e);
    return { statusCode: 500, body: 'Email delivery failed' };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, reference: ref }),
  };
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmail({ meta, ref, now, contactName, contactEmail, contactPhone, title, details }) {
  const rows = details
    .filter(d => d && d.value !== '' && d.value != null)
    .map(d => `
      <tr>
        <td style="padding:9px 0;color:#6b7280;font-size:13px;width:190px;vertical-align:top;">${esc(d.label)}</td>
        <td style="padding:9px 0;color:#111827;font-size:14px;">${esc(d.value)}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

        <tr><td style="background:#0b0b0b;padding:22px 28px;">
          <div style="font-size:20px;font-weight:800;letter-spacing:-.5px;color:#ffffff;">
            tickets<span style="color:#16A34A;">sa</span>
          </div>
          <div style="margin-top:5px;font-size:12px;color:#9ca3af;letter-spacing:.6px;text-transform:uppercase;">${esc(meta.label)}</div>
        </td></tr>

        <tr><td style="padding:26px 28px 8px;">
          <h1 style="margin:0 0 6px;font-size:20px;color:#111827;font-weight:700;">${esc(title)}</h1>
          <p style="margin:0;color:#6b7280;font-size:13px;">Reference ${esc(ref)} · submitted ${esc(now)}</p>
        </td></tr>

        <tr><td style="padding:12px 28px 4px;">
          <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;">Contact</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:9px 0;color:#6b7280;font-size:13px;width:190px;">Name</td><td style="padding:9px 0;color:#111827;font-size:14px;">${esc(contactName)}</td></tr>
            <tr><td style="padding:9px 0;color:#6b7280;font-size:13px;">Email</td><td style="padding:9px 0;color:#111827;font-size:14px;">${esc(contactEmail)}</td></tr>
            <tr><td style="padding:9px 0;color:#6b7280;font-size:13px;">Phone</td><td style="padding:9px 0;color:#111827;font-size:14px;">${esc(contactPhone)}</td></tr>
          </table>
        </td></tr>

        ${rows ? `<tr><td style="padding:12px 28px 20px;">
          <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;">Listing details</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        </td></tr>` : ''}

        <tr><td style="padding:0 28px 26px;">
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;font-size:13px;color:#166534;line-height:1.6;">
            <strong>What happens next:</strong> ${esc(meta.next || 'the TicketsSA team has received this and will review it, usually within one working day. Once everything is confirmed the listing is published on TicketsSA, and customers will contact you directly on the details above.')}
          </div>
        </td></tr>

        <tr><td style="background:#fafafa;border-top:1px solid #e5e7eb;padding:16px 28px;text-align:center;color:#9ca3af;font-size:12px;">
          TicketsSA · South Africa · <a href="https://ticketssa.co.za" style="color:#16A34A;text-decoration:none;">ticketssa.co.za</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;
}
