'use strict';

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME  || '',
  api_key:    process.env.CLOUDINARY_API_KEY      || '',
  api_secret: process.env.CLOUDINARY_API_SECRET   || '',
});

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
  console.warn('[STORAGE] Missing CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, or CLOUDINARY_API_SECRET — uploads will fail.');
}

/**
 * Upload a Buffer to Cloudinary.
 * @param {Buffer} buffer      - File contents
 * @param {Object} options     - Cloudinary upload options (folder, public_id, resource_type, etc.)
 * @returns {Promise<string>}  - Secure HTTPS URL of the uploaded file
 */
function uploadBuffer(buffer, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', ...options },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadBuffer };
