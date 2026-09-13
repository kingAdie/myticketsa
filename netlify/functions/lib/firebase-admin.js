'use strict';

/* ================================================
   Shared Firebase Admin SDK initializer (lib/firebase-admin.js)

   Runs inside Netlify Functions, not Firebase Cloud Functions —
   this is what lets the migration skip Firebase's paid Blaze
   plan entirely for the two things that would normally need it
   (setting custom claims, generating auth-action links). Any
   Node server holding a service account key can call the Admin
   SDK; it doesn't have to be Firebase's own compute.
   ================================================ */

const admin = require('firebase-admin');

let _app = null;
let _db  = null;

function getAdminApp() {
  if (_app) return _app;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (err) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON');
  }

  _app = admin.apps.length
    ? admin.app()
    : admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  return _app;
}

/** Firestore handle with the same ignoreUndefinedProperties setting used
 *  client-side (frontend/js/api.js's firestoreClient()) — Supabase/JSON
 *  silently dropped `undefined` fields; Firestore throws on them by default. */
function getDb() {
  if (_db) return _db;
  getAdminApp();
  _db = admin.firestore();
  _db.settings({ ignoreUndefinedProperties: true });
  return _db;
}

module.exports = { admin, getAdminApp, getDb };
