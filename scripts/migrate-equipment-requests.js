'use strict';

/* ================================================
   One-time: migrate equipment_requests from Supabase to Firestore
   (scripts/migrate-equipment-requests.js)

   Run AFTER scripts/migrate-users.js — user_id is a real FK to
   auth.uid() (backend/database/supabase_schema.sql:152-159), so this
   only resolves correctly once the requesting users exist in
   Firebase Auth with preserved uids, same reasoning as
   migrate-events.js's organiserId.

   Reads via the public Supabase anon key, writes via the Firebase
   Admin SDK. Idempotent: .set() keyed by the Supabase row's own id.

   Usage:
     FIREBASE_SERVICE_ACCOUNT_KEY='<paste the service account JSON>' \
       node scripts/migrate-equipment-requests.js
   ================================================ */

const admin = require('firebase-admin');

const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';

async function fetchAllRequests() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_requests?select=*`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function toFirestoreRequest(row) {
  return {
    userId:       row.user_id,
    serviceId:    row.service_id,
    serviceName:  row.service_name,
    eventDate:    row.event_date,
    duration:     row.duration      || null,
    location:     row.location,
    quantity:     row.quantity      || 1,
    details:      row.details        || null,
    contactPhone: row.contact_phone,
    budgetRange:  row.budget_range    || null,
    status:       row.status,
    createdAt:    row.created_at || new Date().toISOString(),
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

  const rows = await fetchAllRequests();
  console.log(`Fetched ${rows.length} equipment requests from Supabase.`);

  const batchSize = 400; // Firestore batch write limit is 500
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = db.batch();
    for (const row of rows.slice(i, i + batchSize)) {
      batch.set(db.collection('equipmentRequests').doc(String(row.id)), toFirestoreRequest(row));
    }
    await batch.commit();
    console.log(`Wrote equipment requests ${i + 1}-${Math.min(i + batchSize, rows.length)}`);
  }

  console.log('Done. Spot-check a few against their Supabase originals, and confirm the admin Requests tab shows requester names (join against Firestore users/ now, not stale Supabase profiles).');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
