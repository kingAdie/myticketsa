'use strict';

/* ================================================
   One-time: promote the very first admin (scripts/bootstrap-admin.js)

   firebase-set-role.js (the admin panel's "promote user" fix) requires
   the CALLER to already hold the admin custom claim — which is exactly
   right for ongoing use, but means nobody can ever become the first
   admin through the app itself on a brand-new Firebase project. Run
   this once, locally, to bootstrap that first account.

   Usage (from the repo root):
     FIREBASE_SERVICE_ACCOUNT_KEY='<paste the service account JSON>' \
       node scripts/bootstrap-admin.js you@example.com

   Uses the same service account key you'll put in Netlify's
   FIREBASE_SERVICE_ACCOUNT_KEY env var — never commit it, this is a
   one-off local run only.
   ================================================ */

const admin = require('firebase-admin');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: FIREBASE_SERVICE_ACCOUNT_KEY=\'...\' node scripts/bootstrap-admin.js you@example.com');
    process.exit(1);
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    console.error('Set FIREBASE_SERVICE_ACCOUNT_KEY (the service account JSON) in your shell first.');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { role: 'admin' });
  await admin.firestore().collection('users').doc(user.uid).set({ role: 'admin' }, { merge: true });

  console.log(`Done — ${email} (${user.uid}) is now an admin.`);
  console.log('They may need to log out and back in (or wait up to an hour) for the change to take effect.');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
