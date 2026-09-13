'use strict';

/* ================================================
   Paystack: browser return from hosted checkout
   (paystack-verify.js)

   This is the `callback_url` Paystack redirects the buyer's
   browser back to after they pay. It's a convenience path for
   the common case the actual "is this really paid" check and
   ticket creation is done by fulfilPaidTransaction(), shared
   with paystack-webhook.js, which is the reliable backup path
   in case the buyer's browser never makes it back here.
   ================================================ */

const { fulfilPaidTransaction } = require('./lib/ticket-fulfillment');

function redirect(host, path) {
  return { statusCode: 302, headers: { Location: `https://${host}${path}` } };
}

exports.handler = async (event) => {
  const host = event.headers.host;
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

  if (!PAYSTACK_SECRET_KEY) {
    console.error('PAYSTACK_SECRET_KEY not set');
    return redirect(host, '/checkout.html?payment=error');
  }

  const reference = event.queryStringParameters?.reference || event.queryStringParameters?.trxref;
  if (!reference) {
    return redirect(host, '/checkout.html?payment=error');
  }

  // ── Verify with Paystack the only source of truth for "did this pay" ──
  let txn;
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    const data = await res.json();
    if (!res.ok || !data.status) throw new Error(data.message || 'verify failed');
    txn = data.data;
  } catch (err) {
    console.error('[paystack-verify] Paystack verify error:', err);
    return redirect(host, '/checkout.html?payment=error');
  }

  if (txn.status !== 'success') {
    return redirect(host, '/checkout.html?payment=failed');
  }

  try {
    const { ticketId } = await fulfilPaidTransaction(txn);
    return redirect(host, `/success.html?ticket=${encodeURIComponent(ticketId)}`);
  } catch (err) {
    console.error('[paystack-verify] fulfilment failed:', err);
    // Payment succeeded but we couldn't record it the webhook (if configured)
    // gets an independent chance to fulfil it; surface a support path here.
    return redirect(host, `/checkout.html?payment=error&ref=${encodeURIComponent(reference)}`);
  }
};
