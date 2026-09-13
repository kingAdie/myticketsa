'use strict';

/* ================================================
   Paystack: server-to-server payment confirmation
   (paystack-webhook.js)

   Reliability backup for paystack-verify.js: if a buyer pays
   but closes the tab before Paystack redirects them back (or
   the redirect just fails to reach us), this webhook still
   fires from Paystack's servers independently and fulfils the
   ticket. Configure this URL in the Paystack dashboard
   (Settings -> API Keys & Webhooks -> Webhook URL):
     https://<your-site>/.netlify/functions/paystack-webhook

   Every request's signature is verified against the secret key
   before anything else runs, so a forged POST can't be used to
   mint free tickets fulfilPaidTransaction() is never reached
   unless Paystack itself signed the payload.
   ================================================ */

const crypto = require('crypto');
const { fulfilPaidTransaction } = require('./lib/ticket-fulfillment');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET_KEY) {
    console.error('PAYSTACK_SECRET_KEY not set');
    return { statusCode: 500, body: 'Server misconfiguration' };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');

  const signature = event.headers['x-paystack-signature'];
  const expected  = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');

  const sigOk = !!signature
    && signature.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

  if (!sigOk) {
    console.error('[paystack-webhook] invalid or missing signature');
    return { statusCode: 401, body: 'Invalid signature' };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Only act on successful charges; 200 everything else so Paystack
  // doesn't keep retrying events we deliberately ignore.
  if (payload.event !== 'charge.success') {
    return { statusCode: 200, body: 'ignored' };
  }

  try {
    await fulfilPaidTransaction(payload.data);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.error('[paystack-webhook] fulfilment failed:', err);
    return { statusCode: 500, body: 'fulfilment failed' }; // Paystack retries on non-2xx
  }
};
