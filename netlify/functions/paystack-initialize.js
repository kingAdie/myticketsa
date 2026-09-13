'use strict';

/* ================================================
   Paystack: initialize a ticket-purchase transaction
   (paystack-initialize.js)

   Called from checkout.js when the event's payment type is
   'paystack'. Never trusts a client-supplied price the
   ticket type's price is re-fetched from Supabase here so a
   tampered request can't buy a ticket for less than it costs.
   Returns a Paystack-hosted checkout URL for the browser to
   redirect to. The actual ticket row is only created once
   paystack-verify.js confirms the payment succeeded.
   ================================================ */

const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET_KEY) {
    console.error('PAYSTACK_SECRET_KEY not set');
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const firstName     = String(payload.firstName || '').trim();
  const lastName      = String(payload.lastName  || '').trim();
  const email         = String(payload.email     || '').trim();
  const phone         = String(payload.phone     || '').trim();
  const eventId       = String(payload.eventId       || '').trim();
  const eventTitle    = String(payload.eventTitle    || '').trim();
  const eventDate     = payload.eventDate    || null;
  const eventTime     = payload.eventTime    || null;
  const eventLocation = String(payload.eventLocation || '').trim();
  const eventCity     = String(payload.eventCity     || '').trim();
  const eventImage    = payload.eventImage   || null;
  const ticketTypeId  = String(payload.ticketTypeId || '').trim();
  const quantity      = parseInt(payload.quantity, 10) || 1;

  if (!firstName || !lastName || !email || !eventId || !ticketTypeId || quantity < 1) {
    return { statusCode: 400, body: 'Missing required fields' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: 'Invalid email address' };
  }

  // ── Authoritative price lookup never trust a client-supplied amount ──
  let ticketType;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ticket_types?id=eq.${encodeURIComponent(ticketTypeId)}&event_id=eq.${encodeURIComponent(eventId)}&select=id,name,price`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    const rows = await res.json();
    ticketType = Array.isArray(rows) ? rows[0] : null;
  } catch (err) {
    console.error('[paystack-initialize] ticket type lookup failed:', err);
    return { statusCode: 502, body: 'Could not verify ticket price' };
  }

  if (!ticketType) {
    return { statusCode: 400, body: 'Ticket type not found' };
  }

  const unitPrice   = parseFloat(ticketType.price) || 0;
  const subtotal    = Math.round(unitPrice * quantity * 100) / 100;
  const serviceFee  = Math.round(subtotal * 0.05 * 100) / 100;
  const total       = Math.round((subtotal + serviceFee) * 100) / 100;

  if (total <= 0) {
    return { statusCode: 400, body: 'This ticket is free no payment required' };
  }

  const metadata = {
    buyer: { firstName, lastName, email, phone: phone || null },
    eventId, eventTitle, eventDate, eventTime, eventLocation, eventCity, eventImage,
    ticketTypeId, ticketTypeName: ticketType.name, ticketPrice: unitPrice, quantity,
    subtotal, serviceFee, total,
  };

  try {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount:       Math.round(total * 100), // smallest currency unit (cents)
        currency:     'ZAR',
        callback_url: `https://${event.headers.host}/.netlify/functions/paystack-verify`,
        metadata,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.status) {
      console.error('[paystack-initialize] Paystack error:', data);
      return { statusCode: 502, body: data.message || 'Could not start payment' };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authorizationUrl: data.data.authorization_url,
        reference:        data.data.reference,
      }),
    };
  } catch (err) {
    console.error('[paystack-initialize] fetch error:', err);
    return { statusCode: 502, body: 'Could not reach payment provider' };
  }
};
