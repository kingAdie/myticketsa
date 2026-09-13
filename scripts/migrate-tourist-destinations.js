'use strict';

/* ================================================
   One-time: migrate tourist_destinations from Supabase to
   Firestore (scripts/migrate-tourist-destinations.js)

   No owner concept at all this table is admin-only in the app
   (confirmed: no public submission path exists), so there's no
   UID-continuity concern here either.

   Reads via the public Supabase anon key, writes via the Firebase
   Admin SDK. Idempotent: .set() keyed by the Supabase row's own id.

   Usage:
     FIREBASE_SERVICE_ACCOUNT_KEY='<paste the service account JSON>' \
       node scripts/migrate-tourist-destinations.js
   ================================================ */

const admin = require('firebase-admin');

const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';

async function fetchAllDestinations() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tourist_destinations?select=*`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function toFirestoreDestination(row) {
  return {
    name:        row.name,
    description: row.description || null,
    province:    row.province,
    city:        row.city    || null,
    image:       row.image   || null,
    category:    row.category || 'Nature',
    entryFee:    parseFloat(row.entry_fee) || 0,
    website:     row.website  || null,
    featured:    !!row.featured,
    status:      row.status,
    createdAt:   row.created_at || new Date().toISOString(),
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

  const rows = await fetchAllDestinations();
  console.log(`Fetched ${rows.length} tourist destinations from Supabase.`);

  const batchSize = 400; // Firestore batch write limit is 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = db.batch();
    for (const row of rows.slice(i, i + batchSize)) {
      batch.set(db.collection('touristDestinations').doc(row.id), toFirestoreDestination(row));
    }
    await batch.commit();
    console.log(`Wrote tourist destinations ${i + 1}-${Math.min(i + batchSize, rows.length)}`);
  }

  console.log('Done. Spot-check a few against their Supabase originals.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
