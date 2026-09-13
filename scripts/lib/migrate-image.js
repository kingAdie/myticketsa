'use strict';

/* ================================================
   Shared helper: move a base64 image into Firebase Storage
   (scripts/lib/migrate-image.js)

   Used by migrate-events.js, migrate-accommodations.js, and
   migrate-tourist-destinations.js so real data never passes through
   Firestore as a base64 data URL, even transiently (Firestore caps
   documents at 1MiB; a handful of full-size photos gets there fast).

   Requires admin.initializeApp() to have been called with a
   `storageBucket` option (see each script's setup) — a plain
   credential-only init doesn't know which bucket to use.

   Uploaded files are made public via the GCS object ACL
   (file.makePublic()) — this is a *different* access-control layer
   from firebase.storage()'s Security Rules (storage.rules), which
   only governs access through Firebase's own SDK/REST API, not a
   direct storage.googleapis.com URL. Both end up allowing public
   read, matching how these images were never access-controlled at
   all when they were embedded directly in already-public documents.
   ================================================ */

const admin = require('firebase-admin');

const EXT_BY_CONTENT_TYPE = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

/**
 * @param {string|null|undefined} value      possibly a data:image/...;base64,... string
 * @param {string}                storagePath e.g. `uploads/events/migrated/EVT-XXXX`
 * @returns {Promise<string|null>} unchanged if not a base64 image, else the new public URL
 */
async function migrateImageField(value, storagePath) {
  if (!value || typeof value !== 'string' || !value.startsWith('data:image/')) {
    return value || null;
  }

  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    console.warn(`  Could not parse a data: URL at ${storagePath} leaving it as-is.`);
    return value;
  }

  const [, contentType, base64Data] = match;
  const ext    = EXT_BY_CONTENT_TYPE[contentType] || 'jpg';
  const path   = `${storagePath}.${ext}`;
  const buffer = Buffer.from(base64Data, 'base64');

  const bucket = admin.storage().bucket();
  const file   = bucket.file(path);
  await file.save(buffer, { metadata: { contentType } });
  await file.makePublic();

  return `https://storage.googleapis.com/${bucket.name}/${path}`;
}

module.exports = { migrateImageField };
