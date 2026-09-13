'use strict';

/* ================================================
   Admin: promote/demote a user's role
   (firebase-set-role.js)

   The equivalent Supabase-era feature (adminUpdateUserRole) only
   ever wrote a display field in the `profiles` table — it never
   touched auth.users.app_metadata, so it never actually changed
   what the promoted user could do. This is the real fix: the
   custom claim set here is what Auth.isAdmin()/isOrganiser() read
   from the ID token, and what Firestore Security Rules check.

   Requires the CALLER's Firebase ID token and verifies (server
   side, via the Admin SDK) that they themselves already hold the
   admin claim before touching anyone's role — never trust a
   client-asserted "I'm an admin" flag.
   ================================================ */

const { admin, getAdminApp } = require('./lib/firebase-admin');

const VALID_ROLES = ['attendee', 'organiser', 'admin'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let app;
  try {
    app = getAdminApp();
  } catch (err) {
    console.error('[firebase-set-role]', err.message);
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const callerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!callerToken) {
    return { statusCode: 401, body: 'Missing Authorization token' };
  }

  let caller;
  try {
    caller = await admin.auth().verifyIdToken(callerToken);
  } catch (err) {
    return { statusCode: 401, body: 'Invalid or expired token' };
  }

  if (caller.role !== 'admin') {
    return { statusCode: 403, body: 'Admin access required' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const targetUid = String(payload.userId || '').trim();
  const role      = String(payload.role   || '').trim();

  if (!targetUid || !VALID_ROLES.includes(role)) {
    return { statusCode: 400, body: 'Missing or invalid userId/role' };
  }
  if (targetUid === caller.uid) {
    return { statusCode: 400, body: "You can't change your own role" };
  }

  try {
    // The authorization change existing sessions pick this up next time
    // their ID token refreshes (auth.js's onIdTokenChanged listener), or
    // immediately on next login.
    await admin.auth().setCustomUserClaims(targetUid, { role });

    // Mirror onto the Firestore profile too, for display/search only —
    // never read back for authorization decisions.
    await admin.firestore().collection('users').doc(targetUid).set({ role }, { merge: true });
  } catch (err) {
    console.error('[firebase-set-role] failed:', err);
    return { statusCode: 500, body: 'Could not update role' };
  }

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
