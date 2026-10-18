'use strict';

/* Ticket bookings, done on the server.
 *
 * The browser asks; this function checks everything and writes with the
 * Admin SDK. So a booking never fails because of browser-side Firestore
 * rules, and nobody can change a price or fake a payment from the browser.
 *
 *   POST { action: 'create', eventId, ticketTypeId, quantity, firstName, lastName, email, phone, marketingOptIn }
 *        -> { ok, id, ticket }      anyone (guest checkout)
 *   POST { action: 'proof', id, url }
 *        -> { ok }                  whoever holds the ticket id (it is unguessable)
 *   POST { action: 'paid', id }  -> { ok }   buyer says they paid (no slip)
 *   POST { action: 'status', id, status }   + Authorization: Bearer <Firebase ID token>
 *        -> { ok, ticket }          the event's organiser, or an admin
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_KEY (required).
 */

const { admin, getDb } = require('./lib/firebase-admin');

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const str  = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const newId = () => `TKT-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

// Allowed status moves (same as the Firestore rules).
const MOVES = { reserved: ['confirmed', 'cancelled'], confirmed: ['checked_in', 'cancelled'], checked_in: ['confirmed'] };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let db;
  try { db = getDb(); }
  catch (err) { console.error('tickets:', err.message); return json(500, { error: 'Server misconfiguration' }); }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request' }); }

  try {
    if (body.action === 'create') return await create(db, body);
    if (body.action === 'proof')  return await proof(db, body);
    if (body.action === 'paid')   return await paid(db, body);
    if (body.action === 'status') return await status(db, body, event.headers || {});
    return json(400, { error: 'Unknown action' });
  } catch (err) {
    console.error('tickets error:', err);
    return json(500, { error: 'Something went wrong on our side' });
  }
};

/* ── New booking ─────────────────────────────────────────── */
async function create(db, b) {
  const eventId = str(b.eventId, 80);
  const qty     = parseInt(b.quantity, 10);
  const first   = str(b.firstName, 60), last = str(b.lastName, 60);
  const email   = str(b.email, 120).toLowerCase();
  if (!eventId) return json(400, { error: 'This event could not be found.' });
  if (!first)   return json(400, { error: 'Please add your first name.' });
  if (!EMAIL.test(email)) return json(400, { error: 'Please add a valid email address.' });
  if (!(qty >= 1 && qty <= 10)) return json(400, { error: 'You can book 1 to 10 tickets at a time.' });

  const evSnap = await db.collection('events').doc(eventId).get();
  if (!evSnap.exists) return json(404, { error: 'This event could not be found.' });
  const ev = evSnap.data();
  if (ev.status !== 'published') return json(409, { error: 'This event is not taking bookings right now.' });

  // Price comes from the event, never from the browser.
  const types = Array.isArray(ev.ticketTypes) && ev.ticketTypes.length ? ev.ticketTypes
    : [{ id: 'GA', name: 'General admission', price: Number(ev.price) || 0, available: 100 }];
  const tt = types.find(t => String(t.id) === String(b.ticketTypeId)) || (types.length === 1 ? types[0] : null);
  if (!tt) return json(409, { error: 'That ticket type is no longer available. Please go back and choose again.' });
  const left = Number(tt.available);
  if (left >= 0 && qty > left) return json(409, { error: left > 0 ? `Only ${left} ticket${left > 1 ? 's' : ''} left of this type.` : 'This ticket type is sold out.' });

  const price = Number(tt.price) || 0;
  const total = Math.round(price * qty * 100) / 100;
  const free  = total === 0;
  const now   = new Date().toISOString();

  let expiresAt = null;
  if (!free) {
    const start = ev.eventDate ? new Date(`${ev.eventDate}T${String(ev.eventTime || '00:00').slice(0, 5)}:00+02:00`) : null;
    const hold  = ev.reservationHours;
    let exp = hold === 'event' ? start : new Date(Date.now() + (Number(hold) || 48) * 3600 * 1000);
    if (start && !isNaN(start) && exp && exp > start) exp = start;
    expiresAt = exp && !isNaN(exp) ? exp.toISOString() : null;
  }

  const row = {
    status:           free ? 'confirmed' : 'reserved',
    organiserId:      ev.organiserId || null,
    expiresAt,
    confirmedAt:      free ? now : null,
    buyerFirstName:   first,
    buyerLastName:    last,
    buyerEmail:       email,
    buyerPhone:       str(b.phone, 30) || null,
    buyerUid:         str(b.uid, 128) || null,
    marketingOptIn:   b.marketingOptIn === true,
    eventId,
    eventTitle:       ev.title || '',
    eventDate:        ev.eventDate || null,
    eventTime:        ev.eventTime || null,
    eventLocation:    ev.location || '',
    eventCity:        ev.city || '',
    eventImage:       ev.image || null,
    ticketTypeId:     String(tt.id),
    ticketTypeName:   tt.name || 'Ticket',
    ticketPrice:      price,
    quantity:         qty,
    subtotal:         total,
    serviceFee:       0,
    total,
    paymentMethod:    'pending',
    paymentReference: null,
    paidAt:           null,
    qrCodeUrl:        null,
    proofUrl:         null,
    checkedInAt:      null,
    bookedAt:         now,
  };

  let id = newId();
  for (let i = 0; i < 3; i++) {
    try { await db.collection('tickets').doc(id).create(row); break; }
    catch (err) { if (err && (err.code === 6 || /already exists/i.test(err.message || '')) && i < 2) { id = newId(); continue; } throw err; }
  }
  return json(200, { ok: true, id, ticket: row });
}

/* ── Buyer attaches proof of payment ─────────────────────── */
async function proof(db, b) {
  const id  = str(b.id, 60).toUpperCase();
  const url = str(b.url, 500);
  if (!/^TKT-[A-Z0-9]+$/.test(id)) return json(400, { error: 'Booking not found.' });
  if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) return json(400, { error: 'That upload did not work. Please try again.' });
  const ref  = db.collection('tickets').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { error: 'Booking not found.' });
  if (snap.data().status !== 'reserved') return json(409, { error: 'This booking is already confirmed or closed.' });
  const proofUploadedAt = new Date().toISOString();
  await ref.update({ proofUrl: url, proofUploadedAt });
  return json(200, { ok: true, proofUrl: url, proofUploadedAt });
}

/* ── Buyer says "I've paid" (no slip to upload) ─────────── */
async function paid(db, b) {
  const id = str(b.id, 60).toUpperCase();
  if (!/^TKT-[A-Z0-9]+$/.test(id)) return json(400, { error: 'Booking not found.' });
  const ref  = db.collection('tickets').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { error: 'Booking not found.' });
  if (snap.data().status !== 'reserved') return json(409, { error: 'This booking is already confirmed or closed.' });
  const paidClaimedAt = new Date().toISOString();
  await ref.update({ paidClaimedAt });
  return json(200, { ok: true, paidClaimedAt });
}

/* ── Organiser: mark as paid, cancel, check in, undo ─────── */
async function status(db, b, rawHeaders) {
  const headers = Object.fromEntries(Object.entries(rawHeaders).map(([k, v]) => [k.toLowerCase(), v]));
  const token = (headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Please sign in again.' });
  let caller;
  try { caller = await admin.auth().verifyIdToken(token); }
  catch { return json(401, { error: 'Your session has expired. Please sign in again.' }); }

  const id = str(b.id, 60).toUpperCase(), to = str(b.status, 20);
  const ref  = db.collection('tickets').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { error: 'Booking not found.' });
  const t = snap.data();

  const evSnap = t.eventId ? await db.collection('events').doc(t.eventId).get() : null;
  const organiserId = evSnap && evSnap.exists ? evSnap.data().organiserId : t.organiserId;
  if (caller.role !== 'admin' && caller.uid !== organiserId) return json(403, { error: 'Only the organiser of this event can do that.' });

  const from = t.status;
  if (!(MOVES[from] || []).includes(to)) return json(409, { error: `This booking is ${String(from).replace('_', ' ')}, so it cannot be changed like that.` });

  const now = new Date().toISOString();
  const fields = to === 'confirmed' && from === 'checked_in' ? { status: to, checkedInAt: null, checkedInBy: null }
    : to === 'confirmed'  ? { status: to, confirmedAt: now, confirmedBy: caller.uid }
    : to === 'cancelled'  ? { status: to, cancelledAt: now, cancelledBy: caller.uid }
    :                       { status: to, checkedInAt: now, checkedInBy: caller.uid };
  await ref.update(fields);
  return json(200, { ok: true, from, ticket: { ...t, ...fields } });
}
