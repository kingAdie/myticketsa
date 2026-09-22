'use strict';

/* ================================================
   One-time: import existing Supabase Auth users into Firebase Auth
   (scripts/migrate-users.js)

   Why UIDs must be preserved: events.organiserId (Supabase) already
   points at these users' Supabase Auth ids. Phase 1 switched new
   logins over to Firebase's own ids, so without this step every
   migrated event would point at an id that no organiser's new
   Firebase account actually has — silently losing them access to
   their own events.

   `auth.users`/`auth.identities` aren't reachable via the public
   Supabase anon key (protected schema) — no way around a manual
   export first. In Supabase's SQL Editor, run and export each as JSON:

     select id, email, encrypted_password, email_confirmed_at,
            raw_user_meta_data, raw_app_meta_data, created_at
       from auth.users;

     select user_id, provider, identity_data
       from auth.identities;

   Save them as supabase-users-export.json and
   supabase-identities-export.json (arrays of row objects) in this
   scripts/ directory, then run:

     FIREBASE_SERVICE_ACCOUNT_KEY='<paste the service account JSON>' \
       node scripts/migrate-users.js

   Safe to re-run — importUsers() overwrites by uid.
   ================================================ */

const fs   = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Overridable via env so these real-PII exports never have to sit inside
// the repo's own scripts/ directory (git-tracked - a stray `git add -A`
// would happily commit real users' emails otherwise). Defaults preserved
// for anyone following the instructions above as originally written.
const USERS_FILE      = process.env.SUPABASE_USERS_EXPORT_PATH      || path.join(__dirname, 'supabase-users-export.json');
const IDENTITIES_FILE = process.env.SUPABASE_IDENTITIES_EXPORT_PATH || path.join(__dirname, 'supabase-identities-export.json');

function loadJson(file, { required }) {
  if (!fs.existsSync(file)) {
    if (required) {
      console.error(`Missing ${file} see the instructions at the top of this script.`);
      process.exit(1);
    }
    return [];
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Firebase's bcrypt verifier only recognizes $2a$/$2b$ prefixes.
 *  GoTrue (Supabase's auth server) produces $2a$ by default, but rewrite
 *  defensively rather than assume — an unrecognized prefix would silently
 *  break only that one user's password login, nothing else. */
function normaliseBcryptHash(hash) {
  if (!hash || typeof hash !== 'string') return null;
  if (!/^\$2[aby]\$/.test(hash)) return null; // not a bcrypt hash we recognise at all
  if (hash.startsWith('$2y$')) {
    console.warn('  rewriting $2y$ bcrypt prefix to $2a$ for Firebase compatibility');
    return '$2a$' + hash.slice(4);
  }
  return hash;
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

  const users      = loadJson(USERS_FILE, { required: true });
  const identities = loadJson(IDENTITIES_FILE, { required: false });

  const googleByUserId = new Map();
  for (const row of identities) {
    if (row.provider === 'google' && row.identity_data?.sub) {
      googleByUserId.set(row.user_id, row.identity_data);
    }
  }

  console.log(`Loaded ${users.length} Supabase users, ${googleByUserId.size} with a linked Google identity.`);

  const importRecords = [];
  const firestoreWrites = [];
  let skippedNoCredential = 0;

  for (const row of users) {
    const meta      = row.raw_user_meta_data || {};
    const appMeta    = row.raw_app_meta_data  || {};
    const fullName   = meta.full_name || meta.name || '';
    const firstName  = meta.firstName || fullName.split(' ')[0] || '';
    const lastName   = meta.lastName  || fullName.split(' ').slice(1).join(' ') || '';
    const role       = appMeta.role || 'attendee';

    const record = {
      uid:           row.id,
      email:         row.email,
      emailVerified: !!row.email_confirmed_at,
    };
    if (firstName || lastName) record.displayName = `${firstName} ${lastName}`.trim();

    const bcryptHash = normaliseBcryptHash(row.encrypted_password);
    const google      = googleByUserId.get(row.id);

    if (bcryptHash) {
      record.passwordHash = Buffer.from(bcryptHash, 'utf8'); // raw buffer — Admin SDK, not the CLI (no base64)
    }
    if (google) {
      record.providerData = [{ providerId: 'google.com', uid: google.sub, email: row.email }];
    }
    if (!bcryptHash && !google) {
      skippedNoCredential++;
      console.warn(`  ${row.email} (${row.id}): no usable password hash or linked Google identity — imported with no credential, will need "Forgot Password".`);
    }

    importRecords.push(record);
    firestoreWrites.push({
      uid: row.id,
      data: {
        email: row.email || '',
        firstName, lastName,
        organisationName: meta.organisationName || null,
        role,
        createdAt: row.created_at || new Date().toISOString(),
      },
    });
  }

  // importUsers() caps at 1000 records per call.
  for (let i = 0; i < importRecords.length; i += 1000) {
    const chunk = importRecords.slice(i, i + 1000);
    const result = await admin.auth().importUsers(chunk, { hash: { algorithm: 'BCRYPT' } });
    console.log(`Imported chunk ${i / 1000 + 1}: ${result.successCount} ok, ${result.failureCount} failed.`);
    result.errors.forEach(e => console.error('  import error:', chunk[e.index]?.email, e.error.message));
  }

  const batchSize = 400; // Firestore batch write limit is 500
  for (let i = 0; i < firestoreWrites.length; i += batchSize) {
    const batch = db.batch();
    for (const { uid, data } of firestoreWrites.slice(i, i + batchSize)) {
      batch.set(db.collection('users').doc(uid), data, { merge: true });
    }
    await batch.commit();
    console.log(`Wrote users/ profile docs ${i + 1}-${Math.min(i + batchSize, firestoreWrites.length)}`);
  }

  console.log(`Done. ${skippedNoCredential} user(s) imported with no password/Google credential — they'll need "Forgot Password" after cutover.`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
