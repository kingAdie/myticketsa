'use strict';

/* ================================================
   One-time: migrate accommodations from Supabase to Firestore
   (scripts/migrate-accommodations.js)

   Run AFTER scripts/migrate-users.js (accommodations.ownerId only
   resolves correctly once the owning users exist in Firebase Auth
   with preserved uids — though note some historical rows may have a
   null owner_id in Supabase already, since that column's existence
   was uncertain for a long time; those migrate with ownerId: null,
   same as their current behaviour, not worse).

   Reads via the public Supabase anon key, writes via the Firebase
   Admin SDK. Idempotent: .set() keyed by the Supabase row's own id.

   space_types is collapsed to {name, price, capacity} only some
   historical rows also carry placeType/bedrooms/beds/bathrooms
   (written by the seller wizard), but nothing anywhere ever reads
   those back see frontend/js/api.js's buildSpaceTypes() for the
   same rule applied to new writes going forward.

   Usage:
     FIREBASE_SERVICE_ACCOUNT_KEY='<paste the service account JSON>' \
       node scripts/migrate-accommodations.js
   ================================================ */

const admin = require('firebase-admin');

const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';

async function fetchAllAccommodations() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/accommodations?select=*`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function buildSpaceTypes(spaceTypes) {
  return (Array.isArray(spaceTypes) ? spaceTypes : []).map(st => ({
    name:     st.name,
    price:    parseFloat(st.price) || 0,
    capacity: st.capacity != null ? parseInt(st.capacity) : null,
  }));
}

function toFirestoreAccommodation(row) {
  return {
    name:          row.name,
    description:   row.description   || '',
    province:      row.province,
    city:          row.city,
    address:       row.address        || null,
    checkInTime:   row.check_in_time  || '14:00',
    checkOutTime:  row.check_out_time || '10:00',
    priceFrom:     parseFloat(row.price_from) || 0,
    starRating:    row.star_rating    || 0,
    amenities:     row.amenities      || [],
    spaceTypes:    buildSpaceTypes(row.space_types),
    images:        row.images         || [],
    contactEmail:  row.contact_email  || null,
    contactPhone:  row.contact_phone  || null,
    website:       row.website        || null,
    bookingUrl:    row.booking_url    || null,
    featured:      !!row.featured,
    status:        row.status,
    ownerId:       row.owner_id ?? null, // may genuinely be null for historical rows
    createdAt:     row.created_at || new Date().toISOString(),
    updatedAt:     row.updated_at || row.created_at || new Date().toISOString(),
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

  const rows = await fetchAllAccommodations();
  console.log(`Fetched ${rows.length} accommodations from Supabase.`);
  const withNullOwner = rows.filter(r => r.owner_id == null).length;
  if (withNullOwner) console.log(`  ${withNullOwner} row(s) have no owner_id in Supabase — will migrate with ownerId: null.`);

  const batchSize = 400; // Firestore batch write limit is 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = db.batch();
    for (const row of rows.slice(i, i + batchSize)) {
      batch.set(db.collection('accommodations').doc(row.id), toFirestoreAccommodation(row));
    }
    await batch.commit();
    console.log(`Wrote accommodations ${i + 1}-${Math.min(i + batchSize, rows.length)}`);
  }

  console.log('Done. Spot-check a multi-space-type accommodation and a null-owner one against their Supabase originals.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
