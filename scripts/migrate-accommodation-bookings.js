'use strict';

/* ================================================
   One-time: migrate accommodation_bookings from Supabase to
   Firestore (scripts/migrate-accommodation-bookings.js)

   No UID-continuity concerns here bookings are keyed by
   customerEmail, not a user id (confirmed by reading
   getMyAccommodationBookings()), same as tickets. Can run
   independently of migrate-users.js/migrate-accommodations.js.

   Reads via the public Supabase anon key, writes via the Firebase
   Admin SDK. Idempotent: .set() keyed by the Supabase row's own id.

   Usage:
     FIREBASE_SERVICE_ACCOUNT_KEY='<paste the service account JSON>' \
       node scripts/migrate-accommodation-bookings.js
   ================================================ */

const admin = require('firebase-admin');

const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';

async function fetchAllBookings() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/accommodation_bookings?select=*`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function toFirestoreBooking(row) {
  return {
    accommodationId:   row.accommodation_id,
    accommodationName: row.accommodation_name,
    spaceTypeName:     row.space_type_name,
    pricePerNight:     parseFloat(row.price_per_night) || 0,
    checkInDate:       row.check_in_date,
    checkOutDate:      row.check_out_date,
    nights:            row.nights,
    guests:            row.guests,
    totalPrice:        parseFloat(row.total_price) || 0,
    customerName:      row.customer_name,
    customerEmail:     (row.customer_email || '').toLowerCase(),
    customerPhone:     row.customer_phone || null,
    specialRequests:   row.special_requests || null,
    status:            row.status,
    createdAt:         row.created_at || new Date().toISOString(),
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

  const rows = await fetchAllBookings();
  console.log(`Fetched ${rows.length} accommodation bookings from Supabase.`);

  const batchSize = 400; // Firestore batch write limit is 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = db.batch();
    for (const row of rows.slice(i, i + batchSize)) {
      batch.set(db.collection('accommodationBookings').doc(row.id), toFirestoreBooking(row));
    }
    await batch.commit();
    console.log(`Wrote accommodation bookings ${i + 1}-${Math.min(i + batchSize, rows.length)}`);
  }

  console.log('Done. Spot-check a few against their Supabase originals.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
