'use strict';

/* ================================================
   One-time: migrate tickets from Supabase to Firestore
   (scripts/migrate-tickets.js)

   Unlike events, tickets have no UID-continuity problem — buyers
   are matched by buyerEmail, never a user id (confirmed by reading
   getMyTickets()), so this can run independently of user/event
   migration order, though running it after migrate-events.js keeps
   things tidy.

   Reads via the public Supabase anon key (already readable live),
   writes via the Firebase Admin SDK. Idempotent: .set() keyed by the
   Supabase row's own id.

   Usage:
     FIREBASE_SERVICE_ACCOUNT_KEY='<paste the service account JSON>' \
       node scripts/migrate-tickets.js
   ================================================ */

const admin = require('firebase-admin');

const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';

async function fetchAllTickets() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tickets?select=*`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function toFirestoreTicket(row) {
  return {
    status:            row.status,
    buyerFirstName:    row.buyer_first_name,
    buyerLastName:     row.buyer_last_name,
    buyerEmail:        (row.buyer_email || '').toLowerCase(),
    buyerPhone:        row.buyer_phone || null,
    eventId:           row.event_id,
    eventTitle:        row.event_title,
    // Dates/times stay plain strings, exactly as Supabase has them see the
    // same note in migrate-events.js.
    eventDate:         row.event_date,
    eventTime:         row.event_time || null,
    eventLocation:     row.event_location,
    eventCity:         row.event_city,
    eventImage:        row.event_image || null,
    ticketTypeId:      row.ticket_type_id,
    ticketTypeName:    row.ticket_type_name,
    ticketPrice:       parseFloat(row.ticket_price) || 0,
    quantity:          row.quantity,
    subtotal:          parseFloat(row.subtotal)    || 0,
    serviceFee:        parseFloat(row.service_fee) || 0,
    total:             parseFloat(row.total)       || 0,
    paymentMethod:     row.payment_method,
    paymentReference:  row.payment_reference || null,
    paidAt:            row.paid_at || null,
    qrCodeUrl:         row.qr_code_url || null,
    bookedAt:          row.booked_at || new Date().toISOString(),
  };
}

async function main() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    console.error('Set FIREBASE_SERVICE_ACCOUNT_KEY (the service account JSON) in your shell first.');
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  const tickets = await fetchAllTickets();
  console.log(`Fetched ${tickets.length} tickets from Supabase.`);

  const batchSize = 400; // Firestore batch write limit is 500
  for (let i = 0; i < tickets.length; i += batchSize) {
    const batch = db.batch();
    for (const row of tickets.slice(i, i + batchSize)) {
      batch.set(db.collection('tickets').doc(row.id), toFirestoreTicket(row));
    }
    await batch.commit();
    console.log(`Wrote tickets ${i + 1}-${Math.min(i + batchSize, tickets.length)}`);
  }

  console.log('Done. Spot-check a few migrated tickets against their Supabase originals before trusting this fully.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
