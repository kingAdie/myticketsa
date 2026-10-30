'use strict';

/* Service bookings (catering, photography, DJs ...), done on the server.
 *
 * A service is an `events` document with kind: 'service'. It has packages and
 * a list of open dates, each date taking up to `slotsPerDay` bookings.
 * Customers send a REQUEST; the provider accepts (setting the final amount)
 * or declines; the customer then pays the provider directly; the provider
 * marks it as paid. Bookings live in `serviceBookings` and are only ever
 * written here, with admin rights, after these checks.
 *
 *   request  { serviceId, packageId, date, guests, name, email, phone, note }  anyone
 *   availability { serviceId }                          anyone: spots taken per date
 *   get      { id }                                    anyone holding the (unguessable) id
 *   proof    { id, url }                               the customer, once accepted
 *   list     {}                         + Bearer token  the provider (or admin)
 *   respond  { id, accept, amount, reason } + token    the provider: accept or decline
 *   status   { id, status: 'paid'|'cancelled' } + token the provider
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_KEY (required).
 */

const { admin, getDb } = require('./lib/firebase-admin');

const json  = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });
const str   = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const newId = () => `SRV-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const today = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);   // South African date
const LIVE  = ['requested', 'accepted', 'paid'];                                        // statuses that use up a slot

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  let db;
  try { db = getDb(); }
  catch (err) { console.error('service-bookings:', err.message); return json(500, { error: 'Server misconfiguration' }); }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request' }); }

  try {
    switch (body.action) {
      case 'request': return await request(db, body);
      case 'get':     return await get(db, body);
      case 'availability': return json(200, { ok: true, taken: await takenByDate(db, str(body.serviceId, 80)) });
      case 'proof':   return await proof(db, body);
      case 'list':    return await list(db, await caller(event));
      case 'respond': return await respond(db, body, await caller(event));
      case 'status':  return await status(db, body, await caller(event));
      default:        return json(400, { error: 'Unknown action' });
    }
  } catch (err) {
    if (err && err.statusCode) return err;          // a json() response thrown by caller()
    console.error('service-bookings error:', err);
    return json(500, { error: 'Something went wrong on our side' });
  }
};

async function caller(event) {
  const h = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  const token = (h.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw json(401, { error: 'Please sign in again.' });
  try { return await admin.auth().verifyIdToken(token); }
  catch { throw json(401, { error: 'Your session has expired. Please sign in again.' }); }
}

/* Spots already taken on each open date of a service. */
async function takenByDate(db, serviceId) {
  const snap = await db.collection('serviceBookings').where('serviceId', '==', serviceId).get();
  const taken = {};
  snap.docs.forEach(d => { const b = d.data(); if (LIVE.includes(b.status)) taken[b.date] = (taken[b.date] || 0) + 1; });
  return taken;
}

/* ── Customer sends a booking request ───────────────────── */
async function request(db, b) {
  const serviceId = str(b.serviceId, 80);
  const date   = str(b.date, 10);
  const guests = parseInt(b.guests, 10);
  const name   = str(b.name, 120), email = str(b.email, 120).toLowerCase();
  if (!name)               return json(400, { error: 'Please add your name.' });
  if (!EMAIL.test(email))  return json(400, { error: 'Please add a valid email address.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { error: 'Please choose a date.' });

  const sSnap = await db.collection('events').doc(serviceId).get();
  if (!sSnap.exists || sSnap.data().kind !== 'service') return json(404, { error: 'This service could not be found.' });
  const s = sSnap.data();
  if (s.status !== 'published') return json(409, { error: 'This service is not taking bookings right now.' });

  const pkg = (s.packages || []).find(p => String(p.id) === String(b.packageId));
  if (!pkg) return json(409, { error: 'That package is no longer available. Please choose again.' });
  const min = parseInt(pkg.minGuests, 10) || 1, max = parseInt(pkg.maxGuests, 10) || 10000;
  if (!(guests >= min && guests <= max)) return json(400, { error: `This package is for ${min}${max < 10000 ? `–${max}` : '+'} guests.` });

  if (!(s.openDates || []).includes(date) || date < today()) return json(409, { error: 'That date is not available. Please pick another.' });
  const slots = parseInt(s.slotsPerDay, 10) || 1;
  const taken = (await takenByDate(db, serviceId))[date] || 0;
  if (taken >= slots) return json(409, { error: 'That date was just booked. Please pick another.' });

  const price = pkg.price === null || pkg.price === '' || pkg.price === undefined ? null : Number(pkg.price);
  const estimate = price === null ? null : Math.round((pkg.unit === 'guest' ? price * guests : price) * 100) / 100;
  const now = new Date().toISOString();
  const row = {
    status: 'requested',
    serviceId, serviceTitle: s.title || '', serviceImage: s.image || null, ownerId: s.organiserId || null, ownerName: s.organiserName || '',
    packageId: String(pkg.id), packageName: pkg.name || '', unit: pkg.unit === 'guest' ? 'guest' : 'booking', unitPrice: price,
    date, guests, estimate, amount: null,
    customerName: name, customerEmail: email, customerPhone: str(b.phone, 30) || null, customerUid: str(b.uid, 128) || null,
    note: str(b.note, 600) || null,
    proofUrl: null, requestedAt: now, updatedAt: now,
  };
  const id = newId();
  await db.collection('serviceBookings').doc(id).create(row);
  return json(200, { ok: true, id, booking: row });
}

/* ── Anyone with the link: the booking + how to pay ─────── */
async function get(db, b) {
  const id = str(b.id, 60).toUpperCase();
  if (!/^SRV-[A-Z0-9]+$/.test(id)) return json(404, { error: 'Booking not found.' });
  const snap = await db.collection('serviceBookings').doc(id).get();
  if (!snap.exists) return json(404, { error: 'Booking not found.' });
  const bk = snap.data();
  const sSnap = await db.collection('events').doc(bk.serviceId).get();
  const s = sSnap.exists ? sSnap.data() : {};
  // Payment details only once the provider has accepted.
  const pay = bk.status === 'accepted' || bk.status === 'paid' ? {
    paymentType: s.paymentType || null, paymentLink: s.paymentLink || null, bankName: s.bankName || null,
    accountHolder: s.accountHolder || null, accountNumber: s.accountNumber || null, branchCode: s.branchCode || null,
  } : {};
  return json(200, { ok: true, id, booking: bk, service: { title: s.title, slug: s.slug || null, image: s.image || null, ownerName: s.organiserName || '', refundPolicy: s.refundPolicy || null, ...pay } });
}

async function proof(db, b) {
  const id = str(b.id, 60).toUpperCase(), url = str(b.url, 500);
  if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) return json(400, { error: 'That upload did not work. Please try again.' });
  const ref = db.collection('serviceBookings').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return json(404, { error: 'Booking not found.' });
  if (snap.data().status !== 'accepted') return json(409, { error: 'You can upload proof once the provider has accepted your booking.' });
  const at = new Date().toISOString();
  await ref.update({ proofUrl: url, proofUploadedAt: at, updatedAt: at });
  return json(200, { ok: true, proofUrl: url });
}

/* ── Provider side ──────────────────────────────────────── */
async function list(db, who) {
  let q = db.collection('serviceBookings');
  if (who.role !== 'admin') q = q.where('ownerId', '==', who.uid);
  const snap = await q.get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((x, y) => String(y.requestedAt).localeCompare(String(x.requestedAt))).slice(0, 300);
  return json(200, { ok: true, bookings: rows });
}

async function owned(db, id, who) {
  const ref = db.collection('serviceBookings').doc(str(id, 60).toUpperCase());
  const snap = await ref.get();
  if (!snap.exists) throw json(404, { error: 'Booking not found.' });
  const bk = snap.data();
  if (who.role !== 'admin' && who.uid !== bk.ownerId) throw json(403, { error: 'Only the provider can do that.' });
  return { ref, bk };
}

async function respond(db, b, who) {
  const { ref, bk } = await owned(db, b.id, who);
  if (bk.status !== 'requested') return json(409, { error: 'This request has already been answered.' });
  const now = new Date().toISOString();
  if (b.accept) {
    const amount = Math.round(Number(b.amount) * 100) / 100;
    if (!(amount > 0)) return json(400, { error: 'Enter the amount the customer must pay.' });
    const fields = { status: 'accepted', amount, acceptedAt: now, updatedAt: now };
    await ref.update(fields);
    return json(200, { ok: true, booking: { ...bk, ...fields } });
  }
  const fields = { status: 'declined', declineReason: str(b.reason, 400) || null, declinedAt: now, updatedAt: now };
  await ref.update(fields);
  return json(200, { ok: true, booking: { ...bk, ...fields } });
}

async function status(db, b, who) {
  const { ref, bk } = await owned(db, b.id, who);
  const to = str(b.status, 20), now = new Date().toISOString();
  const ok = (to === 'paid' && bk.status === 'accepted') || (to === 'cancelled' && ['requested', 'accepted', 'paid'].includes(bk.status));
  if (!ok) return json(409, { error: 'This booking cannot be changed like that.' });
  const fields = to === 'paid' ? { status: 'paid', paidAt: now, updatedAt: now } : { status: 'cancelled', cancelledAt: now, updatedAt: now };
  await ref.update(fields);
  return json(200, { ok: true, from: bk.status, booking: { ...bk, ...fields } });
}

