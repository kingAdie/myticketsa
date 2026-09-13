'use strict';

/* ================================================
   One-time: migrate events + ticket_types + event_tags from
   Supabase to Firestore (scripts/migrate-events.js)

   Run AFTER scripts/migrate-users.js (events.organiserId only
   resolves correctly once the owning users exist in Firebase Auth
   with preserved uids).

   Reads via the public Supabase anon key (these tables are already
   readable by it live no new Supabase credential needed) and
   writes via the Firebase Admin SDK, which bypasses Security Rules
   (needed since one run writes events "owned" by many different
   organisers).

   No status filter on the read deliberately includes pending/
   rejected events too, not just published ones, so organisers don't
   lose drafts mid-review.

   Idempotent: uses .set() keyed by the Supabase row's own id, so
   re-running just overwrites rather than duplicating.

   Usage:
     FIREBASE_SERVICE_ACCOUNT_KEY='<paste the service account JSON>' \
       node scripts/migrate-events.js
   ================================================ */

const admin = require('firebase-admin');
const { migrateImageField } = require('./lib/migrate-image');

const SUPABASE_URL      = 'https://xaooupqqtbqwjddsqnwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhb291cHFxdGJxd2pkZHNxbndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY1MDUsImV4cCI6MjA5NTgxMjUwNX0.ahG6OtWIfLnjqV0DLI_hRD0bh-IcbV14ok7SxIKH-qE';
const STORAGE_BUCKET     = 'tickets-sa.appspot.com';

/** Mirrors normaliseTime()'s "00:00 means no time published" convention
 *  from frontend/js/api.js, so migrated data reads identically to native
 *  Firestore-created events once normaliseEvent() bridges it back out. */
function cleanTime(value) {
  if (!value) return null;
  const hhmm = String(value).slice(0, 5);
  return hhmm === '00:00' ? null : hhmm;
}

async function fetchAllEvents() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/events?select=*,ticket_types(*),event_tags(*)`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  );
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function buildTicketTypes(rows) {
  return (rows || [])
    .slice()
    // Postgres's embed today has no guaranteed order — sort deterministically
    // by sort_order rather than replicating "whatever order it happened to
    // come back in."
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map(tt => ({
      id:          tt.id,
      name:        tt.name,
      description: tt.description,
      price:       parseFloat(tt.price) || 0,
      available:   tt.available,
      sold:        tt.sold || 0,
    }));
}

async function toFirestoreEvent(row) {
  // Real photos are base64 data URLs today (wizard-core.js, pre-Phase-4) —
  // move them to Storage now rather than let a 1MiB-capped Firestore
  // document ever hold one, even transiently.
  const image = await migrateImageField(row.image, `uploads/event/migrated/${row.id}`);

  return {
    status:        row.status,
    title:         row.title,
    category:      row.category,
    // Dates/times stay plain strings, exactly as Supabase has them never a
    // Firestore Timestamp. Mixing types in the same field would sort old and
    // new data into separate blocks under orderBy('eventDate').
    eventDate:     row.event_date,
    eventTime:     cleanTime(row.event_time),
    endTime:       cleanTime(row.end_time),
    location:      row.location,
    city:          row.city,
    province:      row.province   || null,
    description:   row.description,
    image,
    price:         parseFloat(row.price) || 0,
    featured:      !!row.featured,
    soldOut:       !!row.sold_out,
    organiserName: row.organiser_name,
    organiserId:   row.organiser_id,
    address:       row.address        || null,
    paymentType:   row.payment_type   || null,
    paymentLink:   row.payment_link   || null,
    bankName:      row.bank_name      || null,
    accountHolder: row.account_holder || null,
    accountNumber: row.account_number || null,
    branchCode:    row.branch_code    || null,
    ticketTypes:   buildTicketTypes(row.ticket_types),
    tags:          (row.event_tags || []).map(t => t.tag),
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
  admin.initializeApp({
    credential:    admin.credential.cert(JSON.parse(raw)),
    storageBucket: STORAGE_BUCKET,
  });
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  const events = await fetchAllEvents();
  console.log(`Fetched ${events.length} events from Supabase.`);

  const batchSize = 400; // Firestore batch write limit is 500
  for (let i = 0; i < events.length; i += batchSize) {
    const chunk = events.slice(i, i + batchSize);
    // Image uploads happen one at a time, outside the batch itself is
    // still a single atomic Firestore write once all uploads resolve.
    const docs = await Promise.all(chunk.map(async row => ({
      id:   row.id,
      data: await toFirestoreEvent(row),
    })));
    const batch = db.batch();
    for (const { id, data } of docs) {
      batch.set(db.collection('events').doc(id), data);
    }
    await batch.commit();
    console.log(`Wrote events ${i + 1}-${Math.min(i + batchSize, events.length)}`);
  }

  console.log('Done. Spot-check a few migrated events (especially one with multiple ticket types) against their Supabase originals before trusting this fully.');
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
